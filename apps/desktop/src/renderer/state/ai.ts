/**
 * [INPUT]: Finite smart actions, shared operator-consent version and the active workspace generation.
 * [OUTPUT]: Account-owned provider/feature state, explicit hosted consent, scoped configuration and stale account/assistance cleanup.
 * [POS]: Shared device AI state for setup, settings and existing/new writing features.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { aiProviders, hostedScopeVersion, featureCapability, providerCapabilities } from '../../shared/contracts/values'
import type { AiFeature, AiProvider, Failure, Notice, SmartAction, SmartStatus, TestOutcome } from '../../shared/contracts/smart-input'
import { updateAiScope, suspendHostedScope } from './ai-scope'
import { clearAssistanceDrafts } from './assistance-drafts'
import { desktopApi } from './use-workspace'

export interface Ai {
  status: SmartStatus | null
  connect: (provider: AiProvider, apiKey: string | null) => Promise<TestOutcome | null>
  setFeature: (feature: AiFeature, provider: AiProvider | null, enabled: boolean) => Promise<void>
  forget: (provider: AiProvider) => Promise<void>
  dismiss: (notice: Notice) => Promise<void>
  openConsole: (provider: AiProvider) => void
  refresh: () => Promise<void>
  consentHosted: () => Promise<void>
}
export function useAi(generation: string | undefined): Ai {
  const [status, setStatus] = useState<SmartStatus | null>(null)
  const sequence = useRef(0)
  const owner = useRef<string | null>(null)
  const send = useCallback(async (action: SmartAction): Promise<TestOutcome | null> => {
    const revision = ++sequence.current
    const reply = await desktopApi().smart(action)
    if (revision !== sequence.current) return null
    if (reply.type === 'status') { updateAiScope(reply.status); setStatus(reply.status); return reply.test }
    return null
  }, [])
  const refresh = useCallback(async () => { if (generation) await send({ type: 'status', generation }).catch(() => null) }, [generation, send])
  useEffect(() => { setStatus(null); void refresh() }, [refresh])
  useEffect(() => {
    const api = window.goalloom
    if (!generation || !api?.onAiRefresh) return
    return api.onAiRefresh(() => { void refresh() })
  }, [generation, refresh])
  useEffect(() => {
    const api = window.goalloom
    if (!api?.onSync) return
    return api.onSync(next => {
      if ((next.accountId ?? null) === owner.current) return
      owner.current = next.accountId ?? null; sequence.current++; suspendHostedScope(); setStatus(null); clearAssistanceDrafts(); void refresh()
    })
  }, [refresh])
  return {
    status, refresh,
    consentHosted: async () => { if (generation && status?.hostedAccountId) await send({ type: 'consentHosted', generation, accountId: status.hostedAccountId, scopeVersion: hostedScopeVersion, consent: true }) },
    connect: (provider, apiKey) => generation ? send({ type: 'connect', generation, provider, apiKey, consent: true }) : Promise.resolve(null),
    setFeature: async (feature, provider, enabled) => { if (generation) await send({ type: 'feature', generation, feature, provider, ...(provider === 'hosted' ? { accountId: status?.hostedAccountId ?? null } : {}), enabled }) },
    forget: async provider => { clearAssistanceDrafts(); if (generation) await send({ type: 'forget', generation, provider, ...(provider === 'hosted' ? { accountId: status?.hostedAccountId ?? null } : {}) }) },
    dismiss: async notice => { if (generation) await send({ type: 'dismiss', generation, notice }).catch(() => null) },
    openConsole: provider => { void desktopApi().smart({ type: 'openConsole', provider }).catch(() => null) },
  }
}

// --- Read-only derivations shared by Settings, onboarding and the composer. ---
export const connectedProviders = (status: SmartStatus): AiProvider[] =>
  aiProviders.filter(provider => !!status.providers[provider] && status.providers[provider].credential !== 'missing' && !!status.providers[provider].consentedAt)
// A provider can serve a feature once its key is readable and that model passed its sample.
export const canServe = (status: SmartStatus, provider: AiProvider, feature: AiFeature): boolean => {
  const value = status.providers[provider], capability = featureCapability[feature]
  return providerCapabilities[provider].includes(capability) && value.credential === 'saved' && (provider !== 'hosted' || status.hostedEligible === true) && !!value.consentedAt && !!value.capabilities[capability]
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
