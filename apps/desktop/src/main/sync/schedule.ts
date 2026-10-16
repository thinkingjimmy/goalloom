/**
 * [INPUT]: Window, Realtime and mutation signals; an injected monotonic clock.
 * [OUTPUT]: One bounded executor, retained wakeups and adaptive checks with read backoff.
 * [POS]: Desktop scheduling policy. It does not change operation payloads or business clocks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SyncFailure, syncClock, type SyncClock } from '@goalloom/sync'

export class SyncSchedule {
  private timer: (() => void) | null = null
  private running: Promise<void> | null = null
  private wanted = false
  private enabled = false
  private foreground = true
  private subscribed = false
  private heartbeatAt = -Infinity
  private quietSince = 0
  private idleStep = 0
  private failures = 0
  private retryAt = 0
  private suspended = false
  private delayedUntil = 0

  constructor(private input: {
    run: () => Promise<{ more: boolean; sendable: boolean }>
    onError: (error: unknown) => void
    clock?: SyncClock
    random?: () => number
  }) { this.quietSince = this.clock.now() }

  private get clock() { return this.input.clock ?? syncClock }
  private jitter(ms: number) { return ms * (0.9 + (this.input.random ?? Math.random)() * 0.1) }
  start(): void { if (this.enabled) return; this.enabled = true; this.suspended = false; this.arm(8_000) }
  async retry(): Promise<void> { if (!this.enabled) this.start(); await this.wake() }
  stop(): void { this.enabled = false; this.wanted = false; this.clear() }
  async settle(): Promise<void> { await this.running }
  suspend(): void { this.suspended = true; this.wanted = false; this.clear() }
  resume(): void { this.suspended = false; this.retryAt = 0; this.resetQuiet(); void this.wake() }
  setForeground(value: boolean): void {
    if (this.foreground === value) return
    this.foreground = value; this.resetQuiet()
    if (value) void this.wake()
  }
  connection(subscribed: boolean): void {
    const changed = subscribed !== this.subscribed
    this.subscribed = subscribed
    if (!subscribed) { this.heartbeatAt = -Infinity; this.resetQuiet() }
    if (changed) { this.retryAt = 0; void this.wake() }
  }
  heartbeat(ok: boolean): void {
    if (ok) this.heartbeatAt = this.clock.now()
    else { this.heartbeatAt = -Infinity; this.resetQuiet(); if (this.enabled) this.arm(8_000) }
  }
  changed(): void { this.resetQuiet() }
  private resetQuiet() { this.quietSince = this.clock.now(); this.idleStep = 0 }

  async wake(delay = 0, recover = true): Promise<void> {
    if (!this.enabled || this.suspended) return
    this.wanted = true
    if (recover) this.retryAt = 0
    if (delay > 0 && !this.running) {
      // Later edits join the first mutation's deadline instead of restarting debounce.
      if (!this.delayedUntil) this.delayedUntil = this.clock.now() + delay
      this.arm(Math.max(0, this.delayedUntil - this.clock.now()))
      return
    }
    this.clear()
    if (this.running) return this.running
    if (this.retryAt > this.clock.now()) { this.arm(this.retryAt - this.clock.now()); return }
    this.wanted = false; this.delayedUntil = 0
    const current = this.execute()
    this.running = current
    try { await current } finally {
      if (this.running === current) this.running = null
      if (this.enabled && !this.suspended) this.arm(this.retryAt > this.clock.now() ? this.retryAt - this.clock.now() : this.wanted ? 0 : this.interval())
    }
  }

  private async execute(): Promise<void> {
    try {
      const result = await this.input.run()
      this.failures = 0; this.retryAt = 0
      if (result.sendable) this.resetQuiet()
      if (result.more) this.wanted = true
    } catch (error) {
      this.wanted = false
      if (error instanceof SyncFailure && error.code === 'cancelled') return
      this.input.onError(error)
      if (error instanceof SyncFailure && ['configuration', 'auth', 'key', 'version', 'mismatch', 'storage', 'rejected'].includes(error.code)) {
        this.stop(); return
      }
      const delay = this.jitter([8_000, 16_000, 32_000, 60_000][Math.min(this.failures++, 3)]!)
      this.retryAt = this.clock.now() + Math.max(delay, error instanceof SyncFailure && error.retryAt ? error.retryAt - Date.now() : 0)
    }
  }

  private interval(): number {
    const now = this.clock.now()
    if (this.foreground || !this.subscribed || now - this.heartbeatAt > 60_000 || now - this.quietSince < 120_000) return 8_000
    return this.jitter([30_000, 60_000, 300_000][Math.min(this.idleStep++, 2)]!)
  }
  private arm(ms: number) {
    this.clear()
    if (!this.enabled || this.suspended) return
    this.timer = this.clock.after(ms, () => { this.timer = null; void this.wake(0, false) })
  }
  private clear() { this.timer?.(); this.timer = null }
}
