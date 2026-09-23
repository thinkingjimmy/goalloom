/**
 * [INPUT]: 统一答案（Choice 的 choice/probabilities|null、boolean 的 probability）、请求选项与已核实的舍入精度来源。
 * [OUTPUT]: checkChoice/checkBoolean：契约校验（选项覆盖、有限 0–1、choice 为最大值）、按 K 与 d 的总和容差、topProbability/margin/熵集中度，及字段级确定性判定。
 * [POS]: 两渠道共用的判断策略；不读取供应商 confidence，不改写原分布，不把缺失分布补成概率 1。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export interface Precision { decimals: number | null; source: 'response' | 'adapter' | null }
export interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number> | null }
export interface BooleanAnswer { type: 'boolean'; probability: number }
export type Answer = ChoiceAnswer | BooleanAnswer
export interface Metrics { top: number; margin: number; concentration: number; decimals: number | null; source: Precision['source'] }
export interface CheckedChoice { choice: string; metrics: Metrics | null; distribution: 'valid' | 'missing' | 'unconfirmed' | 'empty' }
export class ContractError extends Error {}

export const epsilon = 1e-6
export function roundingError(decimals: number | null): number { return decimals === null ? 0 : 0.5 * 10 ** -decimals }
export function sumTolerance(options: number, decimals: number | null): number { return options * roundingError(decimals) + epsilon }
export function validDecimals(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 15 }
const probability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

export function checkChoice(answer: unknown, options: string[], precision: Precision): CheckedChoice {
  const row = answer as Partial<ChoiceAnswer> | undefined
  if (!row || row.type !== 'choice' || typeof row.choice !== 'string' || !options.includes(row.choice)) throw new ContractError('答案不属于请求选项')
  const p = row.probabilities
  if (p === null || p === undefined) return { choice: row.choice, metrics: null, distribution: 'missing' }
  const keys = Object.keys(p)
  if (keys.length !== options.length || options.some(option => !keys.includes(option)) || !keys.every(key => probability(p[key]))) throw new ContractError('概率分布键值不合法')
  const values = options.map(option => p[option]!)
  const top = Math.max(...values)
  if (top - p[row.choice]! > epsilon) throw new ContractError('选中项不是概率最大值')
  const sum = values.reduce((total, value) => total + value, 0)
  if (sum <= 0) return { choice: row.choice, metrics: null, distribution: 'empty' }
  // Unknown precision gets only the numeric epsilon; it disables prefill instead of guessing d.
  if (Math.abs(sum - 1) > sumTolerance(options.length, precision.decimals)) {
    if (precision.decimals !== null) throw new ContractError('概率总和超出声明精度的舍入误差')
    return { choice: row.choice, metrics: null, distribution: 'unconfirmed' }
  }
  const sorted = [...values].sort((a, b) => b - a)
  const entropy = values.reduce((total, value) => { const q = value / sum; return q > 0 ? total - q * Math.log(q) : total }, 0)
  const concentration = options.length > 1 ? Math.min(1, Math.max(0, 1 - entropy / Math.log(options.length))) : 1
  return { choice: row.choice, distribution: 'valid', metrics: { top, margin: top - (sorted[1] ?? 0), concentration, decimals: precision.decimals, source: precision.source } }
}
export function checkBoolean(answer: unknown): number {
  const row = answer as Partial<BooleanAnswer> | undefined
  if (!row || row.type !== 'boolean' || !probability(row.probability)) throw new ContractError('是非答案不合法')
  return row.probability
}

// --- Field policy: thresholds shift by the rounding error so a value inside the error band stays unconfirmed. ---
export interface Threshold { top: number; margin: number }
export const defaultThreshold: Threshold = { top: 0.6, margin: 0.2 }
export function certainChoice(checked: CheckedChoice, fallbacks: string[] = ['unclear'], threshold = defaultThreshold): boolean {
  const m = checked.metrics
  if (!m || fallbacks.includes(checked.choice)) return false
  const e = roundingError(m.decimals)
  return m.top - e >= threshold.top && m.margin - 2 * e >= threshold.margin
}
export function booleanState(value: number, decimals: number | null, yes = 0.7, no = 0.3): 'yes' | 'maybe' | 'no' {
  const e = roundingError(decimals)
  return value - e >= yes ? 'yes' : value + e <= no ? 'no' : 'maybe'
}
