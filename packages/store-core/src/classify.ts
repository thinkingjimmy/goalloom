import { isBusinessErrorCode } from '@goalloom/contracts'
import { SyncApplyError } from './driver'

export function businessCode(error: unknown): string | null {
  if (error instanceof SyncApplyError && isBusinessErrorCode(error.code)) return error.code
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('relation cycle') || message.includes('outline goal cycle')) return 'relation_cycle'
  if (message.includes('flow root has parent') || message.includes('nested task inherits') || message.includes('nested task owns incoming flow')) return 'flow_root_parent'
  if (message.includes('flowColor')) return 'flow_color_taken'
  if (message.includes('deleted endpoint') || message.includes('deleted nesting parent')) return 'parent_unavailable'
  if (message.includes('only two outline levels')) return 'outline_conflict'
  if (message.includes('period scale mismatch')) return 'period_scale_mismatch'
  return null
}
