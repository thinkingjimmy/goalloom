/**
 * [INPUT]: 有限 preload smart API、当前工作区代次。
 * [OUTPUT]: useAi：设备侧 AI 服务状态与 connect / setFeature / forget / dismiss / openConsole；代次变化即重新读取（整库替换后自动显示暂停）。connectedProviders、providerIssue、featureProvider 等只读派生。
 * [POS]: renderer/state 的 AI 服务入口，被设置三个面板、Onboarding、composer 与洞察共用；Key 只经一次 connect 提交，状态中只有遮罩提示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useCallback, useEffect, useState } from 'react'
import { aiProviders, featureCapability, providerCapabilities } from '../../shared/contracts/values'
import type { AiFeature, AiProvider, Failure, Notice, SmartAction, SmartStatus, TestOutcome } from '../../shared/contracts/smart-input'
import { desktopApi } from './use-workspace'

export interface Ai {
  status: SmartStatus | null
  connect: (provider: AiProvider, apiKey: string | null) => Promise<TestOutcome | null>
  setFeature: (feature: AiFeature, provider: AiProvider | null, enabled: boolean) => Promise<void>
  forget: (provider: AiProvider) => Promise<void>
  dismiss: (notice: Notice) => Promise<void>
  openConsole: (provider: AiProvider) => void
  refresh: () => Promise<void>
}
export function useAi(generation: string | undefined): Ai {
  const [status, setStatus] = useState<SmartStatus | null>(null)
  const send = useCallback(async (action: SmartAction): Promise<TestOutcome | null> => {
    const reply = await desktopApi().smart(action)
    if (reply.type === 'status') { setStatus(reply.status); return reply.test }
    return null
  }, [])
  const refresh = useCallback(async () => { if (generation) await send({ type: 'status', generation }).catch(() => null) }, [generation, send])
  useEffect(() => { setStatus(null); void refresh() }, [refresh])
  return {
    status, refresh,
    connect: (provider, apiKey) => generation ? send({ type: 'connect', generation, provider, apiKey, consent: true }) : Promise.resolve(null),
    setFeature: async (feature, provider, enabled) => { if (generation) await send({ type: 'feature', generation, feature, provider, enabled }) },
    forget: async provider => { if (generation) await send({ type: 'forget', generation, provider }) },
    dismiss: async notice => { if (generation) await send({ type: 'dismiss', generation, notice }).catch(() => null) },
    openConsole: provider => { void desktopApi().smart({ type: 'openConsole', provider }).catch(() => null) },
  }
}

// --- Read-only derivations shared by Settings, onboarding and the composer. ---
export const connectedProviders = (status: SmartStatus): AiProvider[] =>
  aiProviders.filter(provider => status.providers[provider].credential !== 'missing' && !!status.providers[provider].consentedAt)
// A provider can serve a feature once its key is readable and that model passed its sample.
export const canServe = (status: SmartStatus, provider: AiProvider, feature: AiFeature): boolean => {
  const value = status.providers[provider], capability = featureCapability[feature]
  return providerCapabilities[provider].includes(capability) && value.credential === 'saved' && !!value.consentedAt && !!value.capabilities[capability]
}
export const capableProviders = (feature: AiFeature): AiProvider[] => aiProviders.filter(provider => providerCapabilities[provider].includes(featureCapability[feature]))
export const featureUsers = (status: SmartStatus, provider: AiProvider): AiFeature[] =>
  (['smart', 'insight'] as const).filter(feature => status.features[feature].provider === provider && (status.features[feature].enabled || status.features[feature].paused))
// Something the user must fix on the provider itself: an unreadable key or the latest account-level failure.
export type ProviderIssue = { kind: 'credential'; state: 'unreadable' | 'unavailable' } | { kind: 'failure'; failure: Failure }
export function providerIssue(status: SmartStatus, provider: AiProvider): ProviderIssue | null {
  const value = status.providers[provider]
  if (value.credential === 'unreadable' || value.credential === 'unavailable') return { kind: 'credential', state: value.credential }
  return value.lastFailure ? { kind: 'failure', failure: value.lastFailure } : null
}
