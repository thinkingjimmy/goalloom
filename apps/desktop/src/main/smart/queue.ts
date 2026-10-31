/**
 * [INPUT]: Abortable provider calls from independent capture sessions.
 * [OUTPUT]: At most two concurrent Jev evaluations, with cancelled queued work removed.
 * [POS]: Main-only scheduling; never blocks the storage worker or local creation.
 */
import { Aborted } from './providers'
export class EvaluationQueue {
  private active = 0
  private pending: (() => void)[] = []
  async run<T>(signal: AbortSignal, call: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new Aborted()
    if (this.active >= 2) await new Promise<void>((resolve, reject) => {
      const resume = () => { signal.removeEventListener('abort', cancel); this.active++; resolve() }
      const cancel = () => { this.pending = this.pending.filter(entry => entry !== resume); reject(new Aborted()) }
      this.pending.push(resume)
      signal.addEventListener('abort', cancel, { once: true })
    })
    else this.active++
    try { if (signal.aborted) throw new Aborted(); return await call() }
    finally { this.active--; this.pending.shift()?.() }
  }
}
