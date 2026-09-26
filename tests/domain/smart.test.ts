import { describe, expect, it } from 'vitest'
import { dateCandidates, weekDay } from '../../src/domain/smart/dates'
import { plainLater, segmentSlots } from '../../src/domain/smart/segments'
import { certainChoice, checkBoolean, checkChoice, ContractError, sumTolerance } from '../../src/domain/smart/distribution'
import { planQuestions, relationRound, type QuestionPlan, type SmartContext } from '../../src/domain/smart/questions'
import { estimateTokens, questionBudget } from '../../src/domain/smart/budget'
import { buildPreview, taskSlots, type Round } from '../../src/domain/smart/preview'
import { planOrder, planProblem } from '../../src/domain/plan'
import type { Candidate } from '../../src/shared/contracts/smart-input'

const context = (text: string, candidates: Candidate[] = [], weekStart = 1): SmartContext => ({
  text, referenceDate: '2026-09-23', weekdayName: '周三', timezone: 'Asia/Shanghai', weekStart, candidates,
  periods: { day: { id: 'c:day:2026-09-23', startDate: '2026-09-23', endDate: '2026-09-24' }, week: { id: 'c:week:2026-09-21', startDate: '2026-09-21', endDate: '2026-09-28' }, month: { id: 'c:month:2026-09-01', startDate: '2026-09-01', endDate: '2026-10-01' }, cycle: { id: 'c:cycle:2026-07-01', startDate: '2026-07-01', endDate: '2026-10-01' } },
})
const candidate = (ref: string, title: string, named = false): Candidate => ({ ref, itemId: `item-${ref}`, title, status: 'todo', horizon: 'month', archived: false, flowColor: null, version: 1, named })
const plan = (value: ReturnType<typeof planQuestions>): QuestionPlan => { if ('kind' in value) throw new Error(value.message); return value }
const sure = (options: string[], pick: string) => ({ type: 'choice', choice: pick, probabilities: Object.fromEntries(options.map(option => [option, option === pick ? 0.97 : Number((0.03 / (options.length - 1)).toFixed(2))])) })
// A deterministic fake Jev: answers each question from a table, defaulting to a confident fallback.
function answer(built: QuestionPlan, table: Record<string, string | number>): Round {
  const answers: Record<string, unknown> = {}
  for (const [id, question] of Object.entries(built.questions)) {
    if (question.type === 'boolean') answers[id] = { type: 'boolean', probability: Number(table[id] ?? 0.02) }
    else { const options = Object.keys(question.criteria); const pick = String(table[id] ?? (id.startsWith('role_') ? 'task' : id.startsWith('due_') ? 'none' : options.includes('later') ? 'later' : options[0])); answers[id] = sure(options, pick) }
  }
  return { answers, precision: { decimals: 2, source: 'adapter' } }
}

describe('工作区周与日期候选', () => {
  it('任意 weekStart 下“本周五”按工作区周计算，已过去的星期不换成下周', () => {
    const expected = { 1: '2026-09-25', 2: '2026-09-25', 3: '2026-09-25', 4: '2026-09-18', 5: '2026-09-18', 6: '2026-09-25', 7: '2026-09-25' }
    for (const [start, date] of Object.entries(expected)) expect(weekDay('2026-09-23', Number(start), 5), `weekStart=${start}`).toBe(date)
    // 周六开周：周三所指的本周五是两天后。
    expect(dateCandidates('本周五交付', '2026-09-23', 6)[0]).toMatchObject({ text: '本周五', value: '2026-09-25' })
    expect(dateCandidates('本周一复盘', '2026-09-23', 1)[0]!.value).toBe('2026-09-21')
    expect(dateCandidates('周一复盘', '2026-09-23', 1)[0]!.value).toBe('2026-09-28')
    expect(dateCandidates('下周五', '2026-09-23', 1)[0]!.value).toBe('2026-10-02')
  })
  it('绝对日期、缺年份与相对日期都给出绝对值与歧义标记', () => {
    const found = dateCandidates('今天写文案，明天开会，10月8日前交，3月1日复盘，2027-01-05 截止，月底汇报', '2026-09-23', 1)
    expect(found.map(row => [row.text, row.value, row.ambiguous])).toEqual([
      ['今天', '2026-09-23', false], ['明天', '2026-09-24', false], ['10月8日', '2026-10-08', false],
      ['3月1日', '2027-03-01', true], ['2027-01-05', '2027-01-05', false], ['月底', '2026-09-30', false],
    ])
  })
  it('整体日期表达不被截短：月底/大后天/上周五取绝对值，区间只给歧义，越界说法不产生缩短日期', () => {
    const due = (text: string) => dateCandidates(`${text}前交稿`, '2026-09-24', 1)[0]
    for (const [text, value] of [['下月底', '2026-10-31'], ['10月底', '2026-10-31'], ['十月底', '2026-10-31'], ['下个月底', '2026-10-31'], ['大后天', '2026-09-27'], ['上周五', '2026-09-18'], ['上星期五', '2026-09-18']]) expect(due(text!)?.value, text).toBe(value)
    for (const text of ['本月月底', '这个月月底', '这月月末', '本月底', '这个月底', '月底', '下个月月底']) {
      expect(due(text), text).toMatchObject({ text, value: text.startsWith('下') ? '2026-10-31' : '2026-09-30', ambiguous: false })
    }
    for (const text of ['9月24日至26日前交稿', '9月24日到26号交稿', '2026年9月24日—26日', '九月二十四日至二十六日', '9月24日至10月2日', '周四至周五']) {
      const found = dateCandidates(text, '2026-09-24', 1)
      expect(found.length, text).toBeGreaterThan(0)
      expect(found.every(row => row.ambiguous || row.value === null), text).toBe(true)
    }
    for (const text of ['大大后天', '上上上周五', '13月底', '去年10月底', '2027年10月底']) {
      expect(dateCandidates(text, '2026-09-24', 1).every(row => row.value === null || row.text === text), text).toBe(true)
    }
  })
})

describe('片段与普通保存', () => {
  it('强边界为换行/分号/列表，逗号为弱边界且不超过 8 槽位', () => {
    expect(segmentSlots('本月发布内测版；本周完成登录功能；今天写文案')!.map(slot => slot.text)).toEqual(['本月发布内测版', '本周完成登录功能', '今天写文案'])
    expect(segmentSlots('整理反馈，周五前完成')!.map(slot => slot.text)).toEqual(['整理反馈', '周五前完成'])
    expect(segmentSlots('1. 写文案\n2、改图\n- 发布')!.map(slot => slot.text)).toEqual(['写文案', '改图', '发布'])
    expect(segmentSlots(Array.from({ length: 9 }, (_, i) => `事项${i}`).join('\n'))).toBeNull()
    const long = segmentSlots(Array.from({ length: 7 }, (_, i) => `事项${i}，补充${i}`).join('\n'))!
    expect(long).toHaveLength(8)
    const text = '甲，乙\n丙'
    for (const slot of segmentSlots(text)!) expect(text.slice(slot.start, slot.end)).toBe(slot.text)
  })
  it('普通 Later 取第一非空行为标题并完整保留原文，不因“今天”或换行改变', () => {
    expect(plainLater('\n  今天写文案 \n第二行')).toEqual({ title: '今天写文案', description: '今天写文案 \n第二行' })
    expect(plainLater('单行')).toEqual({ title: '单行', description: '' })
    expect(plainLater('x'.repeat(600))!.title).toHaveLength(500)
    expect(plainLater('  \n ')).toBeNull()
  })
})

describe('统一概率答案', () => {
  const options = (k: number) => Array.from({ length: k }, (_, i) => `o${i}`)
  it('总和容差按 K 与 d 计算：32 项两位 0.16+ε，三位 0.016+ε，未知精度仅 ε', () => {
    expect(sumTolerance(32, 2)).toBeCloseTo(0.160001, 9)
    expect(sumTolerance(32, 3)).toBeCloseTo(0.016001, 9)
    const k32 = options(32), rounded = Object.fromEntries(k32.map((key, i) => [key, i === 0 ? 0.9 : 0]))
    rounded.o1 = 0.05; rounded.o2 = 0.1 // 和 1.05：两位精度下合法
    expect(checkChoice({ type: 'choice', choice: 'o0', probabilities: rounded }, k32, { decimals: 2, source: 'adapter' }).distribution).toBe('valid')
    expect(() => checkChoice({ type: 'choice', choice: 'o0', probabilities: rounded }, k32, { decimals: 3, source: 'response' })).toThrow(ContractError)
    expect(checkChoice({ type: 'choice', choice: 'o0', probabilities: rounded }, k32, { decimals: null, source: null }).distribution).toBe('unconfirmed')
  })
  it('契约违规拒绝：未知选项、缺/多键、越界；choice 非最大值只让该字段待确认；缺分布与全零不补造概率', () => {
    const k2 = ['a', 'b'], p = { decimals: 2, source: 'adapter' as const }
    expect(() => checkChoice({ type: 'choice', choice: 'c', probabilities: null }, k2, p)).toThrow()
    expect(() => checkChoice({ type: 'choice', choice: 'a', probabilities: { a: 1 } }, k2, p)).toThrow()
    expect(() => checkChoice({ type: 'choice', choice: 'a', probabilities: { a: 1, b: 0, c: 0 } }, k2, p)).toThrow()
    expect(() => checkChoice({ type: 'choice', choice: 'a', probabilities: { a: 1.2, b: -0.2 } }, k2, p)).toThrow()
    const inconsistent = checkChoice({ type: 'choice', choice: 'b', probabilities: { a: 0.6, b: 0.4 } }, k2, p)
    expect(inconsistent).toMatchObject({ choice: 'b', metrics: null, distribution: 'inconsistent' }); expect(certainChoice(inconsistent)).toBe(false)
    expect(checkChoice({ type: 'choice', choice: 'a', probabilities: { a: 0.5, b: 0.5 } }, k2, p).metrics!.margin).toBe(0)
    const missing = checkChoice({ type: 'choice', choice: 'a', probabilities: null }, k2, p)
    expect(missing).toMatchObject({ metrics: null, distribution: 'missing' }); expect(certainChoice(missing)).toBe(false)
    expect(checkChoice({ type: 'choice', choice: 'a', probabilities: { a: 0, b: 0 } }, k2, p)).toMatchObject({ metrics: null, distribution: 'empty' })
    expect(() => checkBoolean({ type: 'boolean', probability: Number.NaN })).toThrow()
  })
})

describe('调度与预算', () => {
  it('S=8/D=8/8 个已有根/本批 56 对：核心 44 题（含每项执行时间推测），关系延到补充轮且累计不超过 64', () => {
    const text = Array.from({ length: 8 }, (_, i) => `事项${i} ${i + 1}月${i + 2}日前完成`).join('\n')
    const built = plan(planQuestions(context(text, Array.from({ length: 8 }, (_, i) => candidate(`g${i + 1}`, `流程${i}`)))))
    expect(built.slots).toHaveLength(8); expect(built.dates).toHaveLength(8)
    expect(Object.keys(built.questions)).toHaveLength(44)
    expect(built.deferredRelations).toBe(true)
    expect(built.pairs.every(pair => pair.key === null)).toBe(true)
    const tasks = taskSlots(built, answer(built, {}))
    const next = relationRound(built, tasks, built.state.goals ? Array.from({ length: 8 }, (_, i) => candidate(`g${i + 1}`, `流程${i}`)) : [], 44)!
    expect(Object.keys(next.questions)).toHaveLength(20)
    expect(44 + Object.keys(next.questions).length).toBeLessThanOrEqual(questionBudget)
    // 轮转：被评估的对覆盖所有 8 个下级，而不是前几项耗光预算。
    expect(new Set(next.pairs.filter(pair => pair.key).map(pair => pair.childSlotId)).size).toBe(8)
    expect(next.pairs.filter(pair => !pair.key).length).toBe(120 - 20)
  })
  it('长文本 8 项的补充轮仍在 64 KiB 与 24k token 内，放不下的关系对留待确认', () => {
    for (const length of [200, 300, 400]) {
      const built = plan(planQuestions(context(Array.from({ length: 8 }, (_, i) => `事项${i}${'甲'.repeat(length)}`).join('\n'))))
      const next = relationRound(built, built.slots.map(slot => slot.id), [], Object.keys(built.questions).length)!
      const body = JSON.stringify({ state: next.state, questions: next.questions })
      expect(Buffer.byteLength(body), `length=${length}`).toBeLessThanOrEqual(65536)
      expect(estimateTokens(body), `length=${length}`).toBeLessThanOrEqual(24000)
      expect(next.pairs.some(pair => pair.key === null)).toBe(true)
    }
  })
  it('超长原文或超过 8 项明确要求分批，不截断', () => {
    expect(planQuestions(context('字'.repeat(4001)))).toMatchObject({ kind: 'too_large' })
    expect(planQuestions(context(Array.from({ length: 9 }, (_, i) => `项${i}`).join('\n')))).toMatchObject({ kind: 'too_large' })
  })
})

describe('预览组装', () => {
  it('今天执行＋截止＋点名上级；未支持的提醒可见且不吞任务', () => {
    const text = '今天优化登录页，周五前完成，关联「官网改版」，下午三点提醒我'
    const ctx = context(text, [candidate('g1', '官网改版', true)])
    const built = plan(planQuestions(ctx))
    const preview = buildPreview(ctx, built, answer(built, { horizon_s1: 'day', role_s2: 'modifier', role_s3: 'modifier', role_s4: 'modifier', due_s2: 'd2', use_d2: 'deadline', use_d1: 'execution', rel_1: 0.95, reminder: 0.9, clock: 0.9 }), null)
    expect(preview.drafts).toHaveLength(1)
    expect(preview.drafts[0]!.horizon).toMatchObject({ value: 'day', certain: true })
    expect(preview.drafts[0]!.due.value).toBe('2026-09-25')
    expect(preview.relations.find(row => row.state === 'yes')).toMatchObject({ parent: { kind: 'existing', itemId: 'item-g1' }, childDraftId: 's1' })
    expect(preview.warnings.map(row => row.kind)).toEqual(expect.arrayContaining(['reminder', 'clock_time']))
  })
  it('一项两个已有上级和两个本批上级都可保留，不压成单父；互相冲突的建议去环', () => {
    const text = '发布内测\n完成登录\n写文案\n联调'
    const ctx = context(text, [candidate('g1', '官网'), candidate('g2', '增长')])
    const built = plan(planQuestions(ctx))
    const key = (parent: string, child: string) => built.pairs.find(pair => (pair.parent.kind === 'existing' ? pair.parent.ref : pair.parent.slotId) === parent && pair.childSlotId === child)!.key!
    const preview = buildPreview(ctx, built, answer(built, { [key('g1', 's4')]: 0.9, [key('g2', 's4')]: 0.9, [key('s1', 's4')]: 0.9, [key('s2', 's4')]: 0.9, [key('s4', 's1')]: 0.8 }), null)
    const parents = preview.relations.filter(row => row.childDraftId === 's4' && row.state === 'yes')
    expect(parents).toHaveLength(4)
    expect(preview.relations.find(row => row.childDraftId === 's1' && row.parent.kind === 'draft' && row.parent.draftId === 's4')!.state).toBe('maybe')
  })
  it('缺分布只让相关字段待确认，不阻断无关分支', () => {
    const built = plan(planQuestions(context('本周写周报')))
    const round = answer(built, { horizon_s1: 'week' })
    round.answers.horizon_s1 = { type: 'choice', choice: 'week', probabilities: null }
    const preview = buildPreview(context('本周写周报'), built, round, null)
    expect(preview.drafts[0]!.horizon).toMatchObject({ value: 'week', certain: false })
    expect(preview.warnings.some(row => row.kind === 'precision')).toBe(true)
  })
})

describe('计划图', () => {
  it('稳定拓扑：父在前，同级保持草稿顺序；拒绝环、重复与有色非根', () => {
    const drafts = [{ draftId: 'D', flowColor: null, parentRefs: [{ kind: 'draft' as const, draftId: 'B' }, { kind: 'draft' as const, draftId: 'C' }] }, { draftId: 'B', flowColor: null, parentRefs: [{ kind: 'draft' as const, draftId: 'A' }] }, { draftId: 'A', flowColor: 1, parentRefs: [] }, { draftId: 'C', flowColor: null, parentRefs: [{ kind: 'draft' as const, draftId: 'A' }] }]
    expect(planOrder(drafts)!.map(row => row.draftId)).toEqual(['A', 'B', 'C', 'D'])
    expect(planProblem(drafts)).toBeNull()
    expect(planProblem([{ draftId: 'x', flowColor: 2, parentRefs: [{ kind: 'existing', itemId: 'p', expectedVersion: 1 }] }])).toContain('跟随上级')
    expect(planProblem([{ draftId: 'x', flowColor: null, parentRefs: [{ kind: 'existing', itemId: 'p', expectedVersion: 1 }, { kind: 'existing', itemId: 'p', expectedVersion: 1 }] }])).toContain('重复')
  })
})
