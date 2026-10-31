/**
 * [INPUT]: Real input/retry events, input/manual revisions, workspace/provider identity and optional column/period.
 * [OUTPUT]: Context-bound previews, memory-owned user-intent nonces with optional persistence and draft-only cancellation.
 * [POS]: Renderer capture session; main owns every request already handed to a saved item.
 */
import { aiSource } from './ai-scope'
import type { AnalyzeRequest } from '../../shared/contracts/smart-input'
import type { Snapshot } from '../../shared/contracts/queries'
import { desktopApi } from './use-workspace'

export class CaptureInput {
  sessionId = crypto.randomUUID()
  private key = ''
  private current: AnalyzeRequest | null = null
  private requests: Promise<void> = Promise.resolve()
  private pendingIntent: string | undefined
  private intent: { key: string; nonce: string } | null = null
  inputChanged(): void { if (aiSource('smart')?.provider === 'hosted') this.retry() }
  retry(): void { this.pendingIntent = crypto.randomUUID(); this.key = '' }
  request(snapshot: Snapshot, providerRevision: number, text: string, inputRevision: number, manualRevision: number, target?: AnalyzeRequest['target']): Promise<AnalyzeRequest> {
    const source = aiSource('smart'), nonce = this.pendingIntent
    this.pendingIntent = undefined
    const draft: Omit<AnalyzeRequest, 'requestId' | 'retryId'> = { draftSessionId: this.sessionId, inputRevision, manualRevision,
      generation: snapshot.workspace.generation, providerRevision, contextRevision: snapshot.workspace.revision,
      referenceTime: snapshot.observedAt, text: text.trim(), parentHints: [], ...(target ? { target } : {}) }
    const identity = JSON.stringify([draft.generation, source?.provider, source?.accountId, draft.text, target?.horizon ?? null])
    const pending = this.requests.then(() => this.prepareRequest(draft, snapshot.periods.map(period => period.id), identity, nonce))
    this.requests = pending.then(() => undefined, () => undefined)
    return pending
  }
  private async prepareRequest(draft: Omit<AnalyzeRequest, 'requestId' | 'retryId'>, periodIds: string[], identity: string, nonce?: string): Promise<AnalyzeRequest> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const intent = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    let retryId: string | undefined
    if (nonce) {
      this.intent = { key: intent, nonce }
      retryId = nonce
      try { localStorage.setItem(`goalloom.capture-attempt.${intent}`, nonce) } catch { /* Main persists the charging authority before dispatch. */ }
    } else if (this.intent?.key === intent) retryId = this.intent.nonce
    else {
      try { const stored = localStorage.getItem(`goalloom.capture-attempt.${intent}`); retryId = stored && /^[a-f0-9-]{36}$/.test(stored) ? stored : undefined } catch { /* The durable main intent lock still rejects automatic replay. */ }
      this.intent = retryId ? { key: intent, nonce: retryId } : null
    }
    const key = JSON.stringify([retryId, draft.draftSessionId, draft.generation, draft.contextRevision, periodIds, draft.providerRevision, draft.text, draft.inputRevision, draft.manualRevision, draft.target])
    if (this.key !== key || !this.current) {
      this.key = key
      this.current = { requestId: crypto.randomUUID(), ...draft, ...(retryId ? { retryId } : {}) }
    }
    return this.current
  }
  cancel(): void { void desktopApi().smart({ type: 'cancel', draftSessionId: this.sessionId }).catch(() => {}) }
  rotate(): void { this.cancel(); this.sessionId = crypto.randomUUID(); this.key = ''; this.current = null }
}
