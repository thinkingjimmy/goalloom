/**
 * [INPUT]: Validated draft/review requests (bounded board text, code-computed signals, device preferences) and raw model text.
 * [OUTPUT]: draftPrompt / reviewPrompt (system + user messages), parseDraft / parseReview (sanitised, id-aligned output), prefsText.
 * [POS]: Pure Chinese insight prompts and output validation; callers compute signals, providers perform network calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DraftRequest, DraftTitle, InsightPrefs, ReviewRequest, ReviewText } from '../../shared/contracts/smart-input'

export interface ChatPrompt { system: string; user: string; maxTokens: number }
export class InsightOutputError extends Error {}

// Tested against deepseek flash (2026-09-27): "earliest step" fixed skipped-step titles, the grain rule keeps month plans month-sized.
const nextRules = `你是 Goalloom 的拆解助手。用户点了某个上级条目旁的 ＋，要你为它补「下一步」待办，直接写入看板。
规则：
1. 每个任务只写一条：上级在 target 周期内最早、还没开始的那一步。先在心里排好完成上级所需的步骤顺序（不输出），取第一步；不要跳到后面的步骤。
2. 标题 6–18 个汉字（英文专名按 1 字计），动词开头，写清交付物，读完就知道做完的标志。
3. 沿用上级和用户原文里的专有名词；不复述上级整句；不写原因、时间、emoji，不以标点结尾。
4. siblings 是看板里已有的同级待办，不要重复。
5. 不编造数字；需要数字又不知道时用 [N]。
6. 标题粒度匹配 targetHorizon，而不是统一取最小动作：day = 一次坐下能做完；week = 一周内可交付；month = 一个月内可验收的成果；cycle = 三个月内可验收的阶段里程碑；half = 半年内推动年目标的阶段成果或方向。half/cycle 取最早尚未开始的「阶段」，不能写成盘点、列清单、查资料等一天的准备动作；例如年目标「全网粉丝达到 5w+」的 half 可为「建立稳定内容发布与反馈机制」，该阶段的 cycle 可为「完成首轮内容定位验证」。用户的最小步长偏好只在该周期粒度内适用。
7. 若有「用户偏好」，在不违反 1–6 的前提下遵守。`
const bridgeRules = `kind 为 bridge 的任务：几项「今天」待办直接挂在一个月计划下，跳过了本周。为本周补一个里程碑，children 会改挂到它下面。里程碑要概括 children 共同指向的本周成果，写成可验收的结果（如「…上线」「…完成验收」），6–18 个汉字，沿用原文专有名词。`
const draftOutput = '只输出 JSON：{"items": [{"id": 与任务 id 相同, "title": string, "why": 不超过 20 字，说明为何是这一步}]}，每个任务一条，顺序与 tasks 相同。'

const reviewRules = `你是 Goalloom 的复盘助手。输入里的 signals 是程序已算好的事实（gap 断层、skip 跳级、pace 临期、overload 过载、vague 目标模糊），不要再计算，也不要引入 signals 与看板之外的事实。
写法：
- headline：一句话，≤28 字，说清本期最重要的一个事实。
- advice：一句话，≤32 字，给一个本期内能做的动作，必须对应某条 signal，点名具体条目。
- flags：最多 3 条，按对本期影响排序；每条 note ≤18 字，用用户原文里的名词。
- 不评价用户、不鼓励、不说空话。
- 若有「用户偏好」，在不违反以上规则的前提下遵守语气与关注点；偏好为提问式时，advice 可以写成一个问题。
只输出 JSON：{"headline": string, "advice": string, "flags": [{"goal": string, "kind": string, "note": string}]}`

const stepText: Record<InsightPrefs['stepSize'], string> = { smallest: '每一步尽量小，十几分钟能开始', hour: '每一步控制在 1 小时内能做完', halfDay: '每一步可以是半天的工作量' }
const toneText: Record<InsightPrefs['tone'], string> = { direct: '直接，少铺垫', gentle: '温和', questions: '教练式，用提问引导我自己决定' }
const focusText: Record<InsightPrefs['focus'][number], string> = { gap: '断链', overload: '过载', skip: '跳级', vague: '模糊目标' }
const scopeText: Record<ReviewRequest['scope'], string> = { week: '本周复盘', month: '本月复盘', both: '本周与本月合并复盘' }

export function prefsText(prefs: InsightPrefs, use: 'draft' | 'review'): string {
  const parts: string[] = []
  if (prefs.about.trim()) parts.push(`关于我：${prefs.about.trim()}`)
  if (use === 'draft') {
    parts.push(`拆解偏好：${stepText[prefs.stepSize]}`)
    if (prefs.stepNotes.trim()) parts.push(`拆解时还要注意：${prefs.stepNotes.trim()}`)
  } else {
    parts.push(`复盘语气：${toneText[prefs.tone]}`)
    if (prefs.focus.length) parts.push(`优先关注：${prefs.focus.map(value => focusText[value]).join('、')}`)
  }
  return parts.join('\n')
}

export function draftPrompt(request: DraftRequest): ChatPrompt {
  const bridge = request.tasks.some(task => task.kind === 'bridge')
  const system = [nextRules, bridge ? bridgeRules : '', draftOutput].filter(Boolean).join('\n\n')
  const user = JSON.stringify({ tasks: request.tasks.map(({ id, kind, parent, goal, target, targetHorizon, siblings, children }) => ({ id, kind, parent, goal, target, targetHorizon, siblings, ...(kind === 'bridge' ? { children } : {}) })), board: request.board, 用户偏好: prefsText(request.prefs, 'draft') })
  return { system, user, maxTokens: 120 + 80 * request.tasks.length }
}

export function reviewPrompt(request: ReviewRequest): ChatPrompt {
  const user = JSON.stringify({ scope: scopeText[request.scope], board: request.board, signals: request.signals, 用户偏好: prefsText(request.prefs, 'review') })
  return { system: reviewRules, user, maxTokens: 700 }
}

// --- Output: models drift on punctuation and length; clean what is safe, reject what is not a usable title. ---
const edge = /^[\s"'“”‘’「」『』《》【】（）()\-–—·•。，、；：！？.,;:!?]+|[\s"'“”‘’「」『』《》【】（）()\-–—·•。，、；：！？.,;:!?]+$/gu
const emoji = /\p{Extended_Pictographic}/u
export function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = value.replace(/\s+/g, ' ').replace(edge, '')
  const length = [...title].length
  return length >= 2 && length <= 40 && !emoji.test(title) ? title : null
}
const clip = (value: unknown, max: number) => typeof value === 'string' ? [...value.trim()].slice(0, max).join('') : ''
function json(content: string): Record<string, unknown> {
  const text = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    const value = JSON.parse(text) as unknown
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* fall through */ }
  throw new InsightOutputError('not a JSON object')
}

export function parseDraft(content: string, request: DraftRequest): DraftTitle[] {
  const raw = json(content).items
  if (!Array.isArray(raw)) throw new InsightOutputError('items missing')
  const byId = new Map<string, Record<string, unknown>>()
  for (const entry of raw) if (typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string') byId.set((entry as { id: string }).id, entry as Record<string, unknown>)
  // A single task tolerates a missing/renamed id; batches must align by id.
  const fallback = request.tasks.length === 1 && raw.length === 1 ? raw[0] as Record<string, unknown> : null
  const titles: DraftTitle[] = []
  for (const task of request.tasks) {
    const entry = byId.get(task.id) ?? fallback
    const title = cleanTitle(entry?.title)
    if (!title || task.siblings.includes(title) || title === task.parent) continue
    titles.push({ id: task.id, title, why: clip(entry?.why, 40) })
  }
  if (!titles.length) throw new InsightOutputError('no usable title')
  return titles
}

export function parseReview(content: string): ReviewText {
  const value = json(content)
  const headline = clip(value.headline, 60), advice = clip(value.advice, 80)
  if (!headline) throw new InsightOutputError('headline missing')
  const flags = Array.isArray(value.flags) ? value.flags.slice(0, 3).flatMap(flag => {
    if (typeof flag !== 'object' || flag === null) return []
    const { goal, kind, note } = flag as Record<string, unknown>
    const text = clip(note, 40)
    return text ? [{ goal: clip(goal, 200), kind: clip(kind, 20), note: text }] : []
  }) : []
  return { headline, advice, flags }
}
