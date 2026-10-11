/** Stable sync error codes. Business codes roll back one op; workspace codes pause; storage codes stop writes. */
export const businessErrorCodes = [
  'parent_unavailable', 'relation_cycle', 'flow_root_parent', 'flow_color_taken', 'item_deleted',
  'discard_not_empty', 'restore_superseded', 'guidance_stale', 'calendar_locked', 'stale_preview',
  'revert_superseded', 'rollover_stale', 'period_scale_mismatch', 'item_exists',
] as const
export const workspacePauseCodes = ['key_missing', 'unsupported_version', 'auth', 'generation', 'storage', 'blob_missing'] as const
export const pushErrorCodes = ['op_id_reused', 'stale_epoch', 'rate_limited', 'payload_too_large', 'protocol_too_old'] as const
export type BusinessErrorCode = typeof businessErrorCodes[number]
export type WorkspacePauseCode = typeof workspacePauseCodes[number]
export type PushErrorCode = typeof pushErrorCodes[number]

export function isBusinessErrorCode(code: string): code is BusinessErrorCode {
  return (businessErrorCodes as readonly string[]).includes(code)
}
