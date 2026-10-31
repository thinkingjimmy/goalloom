/**
 * [INPUT]: OS connectivity and an optional monotonic clock for controlled acceptance.
 * [OUTPUT]: Initial connectivity, transitions within two seconds and an idempotent cleanup function.
 * [POS]: Main-process connectivity signal. It does not probe DNS or assert server reachability.
 */
import { net } from 'electron'
import { syncClock, type SyncClock } from '@goalloom/sync'

export type NetworkEventHandler = (event: 'online' | 'offline') => void

export function createNetworkMonitor(handler: NetworkEventHandler, input: { online?: () => boolean; clock?: SyncClock } = {}): () => void {
  const online = input.online ?? (() => net.isOnline())
  const clock = input.clock ?? syncClock
  let previous = online(), stopped = false
  handler(previous ? 'online' : 'offline')
  let cancel: () => void = () => {}
  const check = () => {
    if (stopped) return
    const current = online()
    if (previous !== current) {
      previous = current
      console.info(`[Sync] Network ${current ? 'restored' : 'offline'}`)
      handler(current ? 'online' : 'offline')
    }
    if (!stopped) cancel = clock.after(2_000, check)
  }
  cancel = clock.after(2_000, check)
  return () => { stopped = true; cancel() }
}
