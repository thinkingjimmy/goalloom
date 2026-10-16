/**
 * [INPUT]: Input/manual revisions, workspace/provider identity and optional explicit column/period.
 * [OUTPUT]: Stable request identities shared by typing and immediate submission, with draft-only cancellation.
 * [POS]: Renderer capture session; main owns every request already handed to a saved item.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { AnalyzeRequest } from '../../shared/contracts/smart-input'
import type { Snapshot } from '../../shared/contracts/queries'
import { desktopApi } from './use-workspace'

export class CaptureInput {
  sessionId = crypto.randomUUID()
  private key = ''
  private current: AnalyzeRequest | null = null
  request(snapshot: Snapshot, providerRevision: number, text: string, inputRevision: number, manualRevision: number, target?: AnalyzeRequest['target']): AnalyzeRequest {
    const key = JSON.stringify([snapshot.workspace.generation, snapshot.workspace.revision, snapshot.periods.map(period => period.id), providerRevision, text.trim(), inputRevision, manualRevision, target])
    if (this.key !== key || !this.current) {
      this.key = key
      this.current = { requestId: crypto.randomUUID(), draftSessionId: this.sessionId, inputRevision, manualRevision,
        generation: snapshot.workspace.generation, providerRevision, contextRevision: snapshot.workspace.revision, referenceTime: snapshot.observedAt, text: text.trim(), parentHints: [], ...(target ? { target } : {}) }
    }
    return this.current
  }
  cancel(): void { void desktopApi().smart({ type: 'cancel', draftSessionId: this.sessionId }).catch(() => {}) }
  rotate(): void { this.cancel(); this.sessionId = crypto.randomUUID(); this.key = ''; this.current = null }
}
