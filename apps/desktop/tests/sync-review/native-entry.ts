/**
 * [INPUT]: Existing synthetic two-peer native composition and scoped IPC fault flags.
 * [OUTPUT]: Real renderer/preload/SQLite with a one-time lost resolution reply or pre-write failure.
 * [POS]: Test-only wrapper; production code exposes no fault controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { ipcMain } from 'electron'

const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => register(channel, async (event, ...args) => {
  const resolution = channel === 'goalloom:command' && args[0]?.type === 'resolveSyncReview'
  const fixture = globalThis as unknown as { syncReviewFault?: 'before' | 'after' | 'review' }
  if (channel === 'goalloom:sync' && args[0]?.type === 'reviews' && fixture.syncReviewFault === 'review') { delete fixture.syncReviewFault; throw new Error('Synthetic review read failure') }
  if (resolution && fixture.syncReviewFault === 'before') { delete fixture.syncReviewFault; throw new Error('Synthetic lost request') }
  const result = await listener(event, ...args)
  if (resolution && fixture.syncReviewFault === 'after') { delete fixture.syncReviewFault; throw new Error('Synthetic lost response') }
  return result
})
await import('../sync-security/native-entry')
