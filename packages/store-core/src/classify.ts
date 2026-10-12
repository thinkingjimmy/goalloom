import { isBusinessErrorCode } from '@goalloom/contracts'
import { SyncApplyError } from './driver'

export function businessCode(error: unknown): string | null {
  if (error instanceof SyncApplyError && isBusinessErrorCode(error.code)) return error.code
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('relation cycle')) return 'relation_cycle'
  if (message.includes('flow root has parent')) return 'flow_root_parent'
  if (message.includes('flowColor')) return 'flow_color_taken'
  if (message.includes('deleted endpoint')) return 'parent_unavailable'
  if (message.includes('period scale mismatch')) return 'period_scale_mismatch'
  return null
}
