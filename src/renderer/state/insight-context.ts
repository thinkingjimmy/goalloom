/**
 * [INPUT]: Existing bounded insight requests, actual provider consent and finite task-context queries.
 * [OUTPUT]: Consent-scoped facts/guidance projections and dependency fingerprints for existing caches.
 * [POS]: Renderer read preparation only; main rehydrates all facts before sending a model request.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DraftRequest, ReviewRequest } from '../../shared/contracts/smart-input'
import { desktopApi } from './use-workspace'
type Input = Omit<DraftRequest, 'requestId' | 'prefs'> | Omit<ReviewRequest, 'requestId' | 'prefs'>
export async function enrichInsightRequest<R extends Input>(request: R): Promise<R> {
  const reply = await desktopApi().smart({ type: 'status', generation: request.generation }).catch(() => null)
  const provider = reply?.type === 'status' ? reply.status.features.insight.provider : null
  if (!provider || reply?.type !== 'status' || reply.status.providers[provider].assistanceConsent?.version !== 1) return request
  const identities = 'tasks' in request ? request.tasks.map(task => ({ itemId: task.id, cutoff: undefined })) : request.evidenceRequests ?? []
  const executionContext = []
  for (const identity of identities.slice(0, 8)) {
    const value = await desktopApi().getInsightTaskContext({ type: 'insightTaskContext', itemId: identity.itemId, generation: request.generation,
      ...(identity.cutoff ? { cutoff: identity.cutoff } : {}) }).catch(() => null)
    if (!value) continue
    executionContext.push(value)
    if (new TextEncoder().encode(JSON.stringify(executionContext)).length > 32 * 1024) { executionContext.pop(); break }
  }
  return { ...request, executionContext }
}
export function insightDependencyKey(request: Input): string {
  return JSON.stringify(request.executionContext?.map(row => ({ itemId: row.itemId, cutoff: row.cutoff, guidance: row.guidance,
    revision: row.executionFacts.sourceRevision, calculationVersion: row.executionFacts.calculationVersion,
    localDate: row.executionFacts.asOf.slice(0, 10), pressure: row.executionFacts.pressure })) ?? [])
}
