/**
 * [INPUT]: Source text, workspace periods, bounded existing-parent candidates and shared payload budgets.
 * [OUTPUT]: Initial and supplemental questions within total question, payload and token budgets.
 * [POS]: Provider-neutral smart-input planning, without network calls or preliminary semantic classification.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Candidate } from '../../shared/contracts/smart-input'
import { dateCandidates, type DateCandidate } from './dates'
import { segmentSlots, type Slot } from './segments'
import { sharedTermText } from './terms'
import { dateLimit, payloadLimit, payloadSize, questionBudget, textLimit, tokenBudget } from './budget'
import { serverText } from '../../shared/i18n/server'

// Reserve space for the fixed provider/model envelope; adapters check the exact body too.
const payloadHeadroom = 512, tokenHeadroom = 128
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type NeutralQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'boolean'; instructions: string; criteria: { true: string; false: string } }
export interface SmartContext {
  text: string; referenceDate: string; weekdayName: string; timezone: string; weekStart: number
  periods: Record<'day' | 'week' | 'month' | 'cycle', { id: string; startDate: string; endDate: string }>
  candidates: Candidate[]
}
export interface DateSlot extends DateCandidate { id: string; slotId: string }
export type PairParent = { kind: 'existing'; ref: string } | { kind: 'slot'; slotId: string }
export interface Pair { parent: PairParent; childSlotId: string; key: string | null }
export interface QuestionPlan {
  slots: Slot[]; dates: DateSlot[]; state: { [key: string]: Json }; questions: Record<string, NeutralQuestion>
  pairs: Pair[]; deferredRelations: boolean; estimatedTokens: number
}
export type PlanFailure = { kind: 'too_large'; message: string }

export const layoutOptions = { single: '只有一件事', list: '用户明确列出的多件并列事项', plan: '多件事项且原文写明了它们之间的目标/上下级关系', unclear: '无法判断' }
export const roleOptions = { task: '一件独立要做的事项', part: '描述前面某件事项包含的内容、功能或要求（如“里面有…”“包括…”“能…”“还要支持…”），本身不是另外要去做的事', modifier: '修饰或补充前面事项的说明（如截止、时间、原因、目的或目标、关联）', not_independent: '不构成独立事项的连接词或语气', unclear: '无法判断' }
export const horizonOptions = { day: '今天要做', week: '本周要做', month: '本月要做', cycle: '当前这一轮三个月内要做', later: '没有写执行时间', future: '写了明天、下周、下个月等未来周期才做', unclear: '无法判断' }
export const inferOptions = { day: '适合今天就做（很小、紧急或马上要用）', week: '适合本周内完成', month: '适合本月内完成', cycle: '适合在这一轮三个月内推进', later: '没有时间压力，先放着以后再说' }
export const useOptions = { deadline: '截止日期（在此之前完成）', execution: '执行日期（这一天去做）', other: '与事项时间无关的日期', unclear: '无法判断' }

// Questions name a slot by id and quote at most 40 characters; the full wording is in state.slots once, not per question.
const quote = (text: string) => { const chars = [...text]; return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : text }
const periodText = (context: SmartContext) => Object.fromEntries(Object.entries(context.periods).map(([key, period]) => [key, `${period.startDate} 至 ${period.endDate}（不含结束日）`]))
const weekNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function planQuestions(context: SmartContext): QuestionPlan | PlanFailure {
  if ([...context.text].length > textLimit) return { kind: 'too_large', message: serverText().smart.textTooLong(textLimit) }
  const slots = segmentSlots(context.text)
  if (slots === null) return { kind: 'too_large', message: serverText().smart.tooManyItems }
  const dates = dateCandidates(context.text, context.referenceDate, context.weekStart).map((date, index) => ({ ...date, id: `d${index + 1}`, slotId: slots.find(slot => date.start >= slot.start && date.start < slot.end)?.id ?? slots[0]!.id }))
  if (dates.length > dateLimit) return { kind: 'too_large', message: serverText().smart.tooManyDates }
  let candidates = context.candidates
  for (;;) {
    const plan = assemble(context, slots, dates, candidates)
    const size = payloadSize(plan.state, plan.questions)
    if (size.bytes <= payloadLimit - payloadHeadroom && size.tokens <= tokenBudget - tokenHeadroom) return { ...plan, estimatedTokens: size.tokens }
    // --- Trim order: unnamed candidates first (their pairs go with them); the original text is never cut. ---
    const drop = [...candidates].reverse().find(candidate => !candidate.named) ?? candidates.at(-1)
    if (!drop) return { kind: 'too_large', message: serverText().smart.failures.too_large() }
    candidates = candidates.filter(candidate => candidate !== drop)
  }
}

function assemble(context: SmartContext, slots: Slot[], dates: DateSlot[], candidates: Candidate[]): Omit<QuestionPlan, 'estimatedTokens'> {
  const questions: Record<string, NeutralQuestion> = {}
  const ask = (id: string, question: NeutralQuestion) => { questions[id] = question }
  ask('layout', { type: 'choice', instructions: '根据 state.text 原文，判断用户写下的内容整体属于哪种形式。只依据原文，不要推测用户没有写出的步骤。', criteria: layoutOptions })
  for (const slot of slots) {
    const ref = `state.slots 中 id 为 ${slot.id} 的片段「${quote(slot.text)}」`
    ask(`role_${slot.id}`, { type: 'choice', instructions: `结合 state.text 完整原文，判断${ref}的角色。该片段只是按标点切出的候选，尚未确定为事项；用户逐行或用列表写出的每一条，通常各自是独立事项（即使它们同属一个目标）；只有在一句话里描述前一件事内部内容的片段才属于组成部分。`, criteria: roleOptions })
    ask(`horizon_${slot.id}`, { type: 'choice', instructions: `结合 state.text 完整原文与 state.reference 参考日，判断${ref}所说事项打算在什么时间范围去做（执行时间，不是截止日）。只有明确写出“今天/本周/本月/这三个月”等执行时间才选对应范围；“周五前完成”是截止而非执行时间。state.periods 给出各范围的实际日期。`, criteria: horizonOptions })
    ask(`infer_${slot.id}`, { type: 'choice', instructions: `假设${ref}所说事项在原文里没有写执行时间。结合它的工作量、紧迫程度，以及 state.goals 中它可能所属的目标所在的列（column），推测最合适的执行范围。所属目标在某列时，它通常安排在比该列更短的范围内；看不出时间压力就选 later。`, criteria: inferOptions })
    const due: Record<string, string> = Object.fromEntries(dates.map(date => [date.id, `state.dates 中 ${date.id}「${date.text}」${date.value ? `= ${date.value}` : ''}`]))
    ask(`due_${slot.id}`, { type: 'choice', instructions: `判断${ref}所说事项的截止日期来自原文中的哪个日期表达；没有写截止日选 none。`, criteria: { ...due, none: '没有截止日期', unclear: '无法判断' } })
  }
  for (const date of dates) ask(`use_${date.id}`, { type: 'choice', instructions: `判断 state.dates 中 ${date.id} 的日期表达「${date.text}」在 state.text 原文里的用途。`, criteria: useOptions })
  ask('reminder', { type: 'boolean', instructions: '根据 state.text 原文，用户是否要求在某个时刻提醒自己？', criteria: { true: '明确要求提醒', false: '没有要求提醒' } })
  ask('repeat', { type: 'boolean', instructions: '根据 state.text 原文，用户是否要求事项重复发生（如每天、每周）？', criteria: { true: '明确要求重复', false: '没有要求重复' } })
  ask('clock', { type: 'boolean', instructions: '根据 state.text 原文，用户是否写了具体时刻（如下午三点、15:00）？', criteria: { true: '写了具体时刻', false: '没有具体时刻' } })
  const core = Object.keys(questions).length
  const all = relationPairs(slots, candidates)
  // If every pair fits, one request answers everything; otherwise relations wait for the named supplement after grouping.
  const deferredRelations = core + all.length > questionBudget
  const pairs = deferredRelations ? all.map(pair => ({ ...pair, key: null })) : all.map((pair, index) => ({ ...pair, key: `rel_${index + 1}` }))
  for (const pair of pairs) if (pair.key) ask(pair.key, relationQuestion(pair, slots, candidates))
  const state: { [key: string]: Json } = {
    text: context.text,
    reference: { date: context.referenceDate, weekday: context.weekdayName, timezone: context.timezone, weekStart: weekNames[context.weekStart]! },
    periods: periodText(context),
    slots: slots.map(slot => ({ id: slot.id, text: slot.text })),
    dates: dates.map(date => ({ id: date.id, text: date.text, slot: date.slotId, date: date.value, ambiguous: date.ambiguous })),
    goals: candidates.map(candidate => ({ id: candidate.ref, title: candidate.title, status: candidate.status, archived: candidate.archived, named: candidate.named, sharedTerm: sharedTermText(context.text, candidate.title), column: candidate.horizon })),
  }
  return { slots, dates, state, questions, pairs, deferredRelations }
}

// --- Named pairs first, then round-robin across child slots so early items cannot exhaust the budget. ---
export function relationPairs(slots: Slot[], candidates: Candidate[], allowedSlots = slots.map(slot => slot.id)): Pair[] {
  const allowed = slots.filter(slot => allowedSlots.includes(slot.id))
  const named: Pair[] = [], queues = new Map<string, Pair[]>()
  for (const child of allowed) {
    const queue: Pair[] = []
    for (const candidate of candidates) {
      const pair: Pair = { parent: { kind: 'existing', ref: candidate.ref }, childSlotId: child.id, key: null }
      if (candidate.named && (allowed.length === 1 || child.text.includes(candidate.title))) named.push(pair)
      else queue.push(pair)
    }
    for (const parent of allowed) if (parent.id !== child.id) queue.push({ parent: { kind: 'slot', slotId: parent.id }, childSlotId: child.id, key: null })
    queues.set(child.id, queue)
  }
  const ordered = [...named]
  for (let round = 0; [...queues.values()].some(queue => queue.length > round); round++) {
    for (const child of allowed) { const pair = queues.get(child.id)![round]; if (pair) ordered.push(pair) }
  }
  return ordered
}

export function relationQuestion(pair: Pair, slots: Slot[], candidates: Candidate[], source = 'state.slots'): NeutralQuestion {
  const child = slots.find(slot => slot.id === pair.childSlotId)!
  const parent = pair.parent.kind === 'existing'
    ? `state.goals 中 id 为 ${pair.parent.ref} 的已有目标「${quote(candidates.find(candidate => candidate.ref === (pair.parent as { ref: string }).ref)?.title ?? '')}」`
    : `${source} 中 id 为 ${pair.parent.slotId} 的「${quote(slots.find(slot => slot.id === (pair.parent as { slotId: string }).slotId)?.text ?? '')}」`
  return { type: 'boolean', instructions: `根据 state.text 原文，${source} 中 id 为 ${child.id} 的「${quote(child.text)}」所说事项，是否是为了推进${parent}而做（后者是它的直接上级目标）？以下任一情况才算：原文明确点名关联或写明“为了/属于”；原文结构表明它是后者下面分解出的条目（如后者作为标题、下方用列表或冒号列出它）；它明确是后者所指的同一个项目/产品里的工作（如都提到同一个项目名，state.goals 的 sharedTerm 给出共同词），完成它能推进后者。只是话题相近或时间尺度不同不算。`, criteria: { true: '原文的措辞、列表结构或同一项目名表明是它的上级目标', false: '原文没有这种依据' } }
}

// --- Named supplement: only after round one fixes which slots are tasks; shares the cumulative 64-question budget. ---
export function relationRound(plan: QuestionPlan, taskSlotIds: string[], candidates: Candidate[], used: number): { questions: Record<string, NeutralQuestion>; pairs: Pair[]; state: { [key: string]: Json } } | null {
  if (!plan.deferredRelations) return null
  const left = Math.max(0, questionBudget - used)
  const pairs = relationPairs(plan.slots, candidates, taskSlotIds).map((pair, index) => ({ ...pair, key: index < left ? `rel_${index + 1}` : null }))
  if (!pairs.some(pair => pair.key)) return { questions: {}, pairs, state: {} }
  const questions: Record<string, NeutralQuestion> = {}
  for (const pair of pairs) if (pair.key) questions[pair.key] = relationQuestion(pair, plan.slots, candidates, 'state.tasks')
  const tasks = plan.slots.filter(slot => taskSlotIds.includes(slot.id)).map(slot => ({ id: slot.id, text: slot.text }))
  const state = { text: plan.state.text!, reason: '第一轮已确定事项分组，补充判断事项之间及与已有目标的上级关系', tasks, goals: [] as Json[] }
  // Retain original text and every task. Drop low-priority pairs, never turn them into "no".
  for (;;) {
    const usedGoals = new Set(pairs.filter(pair => pair.key && pair.parent.kind === 'existing').map(pair => (pair.parent as { ref: string }).ref))
    state.goals = candidates.filter(candidate => usedGoals.has(candidate.ref)).map(candidate => ({ id: candidate.ref, title: candidate.title, status: candidate.status, archived: candidate.archived, named: candidate.named }))
    const size = payloadSize(state, questions)
    if (size.bytes <= payloadLimit - payloadHeadroom && size.tokens <= tokenBudget - tokenHeadroom) return { questions, pairs, state }
    const last = pairs.findLast(pair => pair.key !== null)
    if (!last) return { questions: {}, pairs, state: {} }
    delete questions[last.key!]; last.key = null
  }
}
