/**
 * [INPUT]: Explicit elapsed durations from sync acceptance scenarios.
 * [OUTPUT]: Deterministic monotonic deadlines; no business-date substitution.
 * [POS]: E2E clock fixture, shared by headless and native-window acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SyncClock } from '@goalloom/sync'
export class Clock implements SyncClock {
  time = 0
  timers = new Map<number, { at: number; work: () => void }>()
  id = 0
  now = () => this.time
  after = (ms: number, work: () => void) => {
    const id = ++this.id; this.timers.set(id, { at: this.time + ms, work })
    return () => { this.timers.delete(id) }
  }
  async advance(ms: number) {
    const end = this.time + ms
    for (;;) {
      const next = [...this.timers].filter(([, row]) => row.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      this.time = next[1].at; this.timers.delete(next[0]); next[1].work()
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    this.time = end
    await new Promise<void>(resolve => setImmediate(resolve))
  }
}
