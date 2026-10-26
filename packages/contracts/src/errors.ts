/**
 * [INPUT]: Sync application, workspace/push failures and service admission categories.
 * [OUTPUT]: Stable error-code lists, guards, types and compatibility header, without conflating service denial and Auth.
 * [POS]: Shared sync failure contract. Business errors reject one op; unknown storage errors stop the batch.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const businessErrorCodes = [
  'parent_unavailable', 'relation_cycle', 'relation_exists', 'horizon_order', 'flow_root_parent', 'flow_color_taken', 'item_deleted', 'outline_conflict',
  'discard_not_empty', 'restore_superseded', 'guidance_stale', 'calendar_locked', 'stale_preview',
  'revert_superseded', 'rollover_stale', 'period_scale_mismatch', 'item_exists',
] as const
export const workspacePauseCodes = ['key_missing', 'unsupported_version', 'auth', 'generation', 'storage', 'blob_missing'] as const
export const pushErrorCodes = ['op_id_reused', 'stale_epoch', 'rate_limited', 'payload_too_large', 'protocol_too_old'] as const
export const serviceFailureCodes = ['service_not_started', 'service_expired', 'service_revoked', 'upgrade_required', 'billing_configuration', 'retrieval_closed'] as const
export type ServiceFailureCode = typeof serviceFailureCodes[number]
export const isServiceFailureCode = (code: unknown): code is ServiceFailureCode => serviceFailureCodes.some(value => value === code)
export type BusinessErrorCode = typeof businessErrorCodes[number]
export type WorkspacePauseCode = typeof workspacePauseCodes[number]
export type PushErrorCode = typeof pushErrorCodes[number]

export function isBusinessErrorCode(code: string): code is BusinessErrorCode {
  return (businessErrorCodes as readonly string[]).includes(code)
}
