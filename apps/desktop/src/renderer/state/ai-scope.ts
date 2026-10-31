/**
 * [INPUT]: Authoritative AI status and immediate account-transition suspension.
 * [OUTPUT]: A stable writing-source identity and subscription, independent of prompt text/preferences.
 * [POS]: Renderer cache ownership. Account/source changes invalidate pending results without starting model work.
 */
import { useSyncExternalStore } from 'react'
import type { AiFeature, AiSource, SmartStatus } from '../../shared/contracts/smart-input'
let current: string | null = null
let latest: SmartStatus | null = null
export function aiSource(feature: AiFeature): AiSource | undefined {
  const setting = latest?.features[feature]
  return setting?.provider ? { provider: setting.provider, accountId: setting.provider === 'hosted' ? latest!.hostedAccountId : null, revision: setting.revision, sessionRevision: latest!.sessionRevision ?? 0 } : undefined
}
const listeners = new Set<() => void>()
export const aiScope = (): string | null => current
const publish = (next: string) => { if (next !== current) { current = next; listeners.forEach(listener => listener()) } }
export function updateAiScope(status: SmartStatus): void {
  latest = status
  const provider = status.features.insight.provider
  publish(provider === 'hosted' ? `hosted:v1:${status.hostedAccountId ?? 'signed-out'}` : `byok:${provider ?? 'none'}`)
}
export function suspendHostedScope(): void { latest = null; if (current?.startsWith('hosted:')) publish('hosted:suspended') }
export function useAiScope(): string | null {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, aiScope)
}

export function aiSourceOptions(feature: AiFeature): { source?: AiSource } {
  const source = aiSource(feature)
  return source ? { source } : {}
}
