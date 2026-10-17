/**
 * [INPUT]: Live sync status, workspace generation and guarded IPC comparisons/receipts.
 * [OUTPUT]: A quiet board notice and a sequential, selection-only native review dialog.
 * [POS]: Sync feedback owner; only explicit Next/Finish can resolve a task group.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandInput } from '../../../shared/contracts/commands'
import type { SyncReview, SyncReviewPage } from '../../../shared/contracts/sync-review'
import { messages, settingsMessages as s } from '../../i18n'
import { Modal } from '../../components/Modal'
import { ActionButton, TextButton } from '../../components/ui/button'
import { desktopApi } from '../../state/use-workspace'
import { useSync } from '../../state/sync'
import { TaskComparison } from './TaskComparison'
import './sync-review.css'

const openEvent = 'goalloom:review-sync'
export function requestSyncReview(): void { window.dispatchEvent(new Event(openEvent)) }

function choiceCaption(review: SyncReview, side: 'local' | 'current'): string {
  const t = s.sync
  if (!review.canUseLocal) return side === 'local' ? t.reviewUnavailable : t.reviewKeepCurrent
  if (review.current.missing) return side === 'local' ? t.reviewKeepTask : t.reviewKeepCurrent
  if (review.current.deleted) return side === 'local' ? t.reviewRestore : t.reviewKeepDeleted
  return ''
}

export function SyncFeedback({ generation }: { generation: string }) {
  const status = useSync(), t = s.sync
  const [open, setOpen] = useState(false), [page, setPage] = useState<SyncReviewPage | null>(null)
  const [selected, setSelected] = useState<'current' | 'local'>('current')
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [processed, setProcessed] = useState(0)
  const pending = useRef<Extract<CommandInput, { type: 'resolveSyncReview' }> | null>(null)
  const choices = useRef(new Map<string, 'current' | 'local'>()), locked = useRef(false), epoch = useRef(0)
  const currentPage = useRef(page); currentPage.current = page
  const trigger = useRef<Element | null>(null), choiceRef = useRef<HTMLInputElement>(null), scroll = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  const close = useCallback(() => {
    if (locked.current) return
    setOpen(false); opened.current = false; epoch.current++
    if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus({ preventScroll: true })
  }, [])
  const load = useCallback(async (reset = false) => {
    const request = ++epoch.current
    const reply = await desktopApi().sync({ type: 'reviews', generation })
    if (request !== epoch.current || !opened.current) return
    if (!reply.reviews) throw new Error('Missing review page')
    const next = reply.reviews
    if (!next.review) { setOpen(false); opened.current = false; if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus({ preventScroll: true }); return }
    setPage(next)
    setSelected(reset || !next.review.canUseLocal ? 'current' : choices.current.get(next.review.itemId) ?? 'current')
    requestAnimationFrame(() => { scroll.current?.scrollTo({ top: 0 }); choiceRef.current?.focus({ preventScroll: true }) })
  }, [generation])
  useEffect(() => {
    const show = () => {
      if (opened.current) return
      if (pending.current && currentPage.current) { trigger.current = document.activeElement; opened.current = true; setOpen(true); return }
      trigger.current = document.activeElement; opened.current = true; setOpen(true); setProcessed(0); setPage(null); setError('')
      void load().catch(() => setError(s.sync.reviewFailed))
    }
    window.addEventListener(openEvent, show)
    return () => { window.removeEventListener(openEvent, show); epoch.current++; opened.current = false }
  }, [load])
  useEffect(() => {
    if (open && status && status.phase !== 'ready') close()
  }, [status?.phase, open, close])
  const submit = async () => {
    if (locked.current || !page?.review) { if (!locked.current) void load().catch(() => setError(t.reviewFailed)); return }
    const review = page.review
    const command = pending.current ?? { type: 'resolveSyncReview' as const, operationId: crypto.randomUUID(), generation, itemId: review.itemId, token: review.token, choice: selected }
    pending.current = command; locked.current = true; setWorking(true); setError('')
    try {
      let reply
      try { reply = await desktopApi().execute(command) }
      catch {
        const receipt = await desktopApi().getReceipt(command.operationId, generation)
        if (!receipt) throw new Error('Unconfirmed resolution')
        reply = { ok: true as const, result: receipt }
      }
      if (!reply.ok) {
        pending.current = null
        if (['stale', 'conflict', 'generation'].includes(reply.code)) { await load(true); setError(t.reviewUpdated) }
        else setError(reply.message)
        return
      }
      choices.current.delete(review.itemId)
      await load(); pending.current = null; setProcessed(value => value + 1)
    } catch { setError(t.reviewFailed) }
    finally { locked.current = false; setWorking(false) }
  }
  const review = page?.review
  return <>
    {status?.phase === 'ready' && status.conflicts > 0 && <div className="notice-banner sync-review-notice" role="status"><span>{t.reviewNotice(status.conflicts)}</span><TextButton onClick={requestSyncReview}>{t.reviewDetails}</TextButton></div>}
    {open && <Modal title={t.reviewTitle} close={close} className="sync-review-modal" actions={review && <span className="sync-review-progress">{processed + 1} / {processed + page.remaining}</span>}>
      <div ref={scroll} className="sync-review-scroll" aria-busy={working}>
        {review ? <><p className="sync-review-reason">{t.reviewReasons[review.reason]}</p><fieldset className="sync-review-compare" disabled={working || !!pending.current}>
          <legend className="sr-only">{t.reviewTitle}</legend>
          {(['local', 'current'] as const).map(side => {
            const caption = choiceCaption(review, side)
            return <section key={side} className="sync-review-side" data-selected={selected === side} data-side={side}>
            <label className="sync-review-choice"><input ref={selected === side ? choiceRef : undefined} type="radio" name="sync-review-version" value={side} checked={selected === side} disabled={side === 'local' && !review.canUseLocal}
              aria-describedby={caption ? `sync-review-effect-${side}` : undefined}
              onChange={() => { setSelected(side); choices.current.set(review.itemId, side) }} />
              <span><strong>{side === 'local' ? t.reviewLocal : t.reviewCurrent}</strong>{caption && <small id={`sync-review-effect-${side}`}>{caption}</small>}</span>
            </label><TaskComparison task={review[side]} other={review[side === 'local' ? 'current' : 'local']} />
          </section>})}
        </fieldset></> : <p className="sync-review-reason">{t.loading}</p>}
        {error && <p className="sync-review-error" role="alert">{error}</p>}
      </div>
      <footer className="sync-review-footer"><TextButton disabled={working} onClick={close}>{t.reviewLater}</TextButton><ActionButton variant="primary" disabled={working} onKeyDown={event => { if (event.key === 'Enter' && event.repeat) event.preventDefault() }} onClick={event => { if (event.detail <= 1) void submit() }}>{review ? page.remaining === 1 ? t.reviewFinish : t.reviewNext : messages.retry}</ActionButton></footer>
    </Modal>}
  </>
}
