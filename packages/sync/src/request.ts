/**
 * [INPUT]: Caller/lifecycle cancellation and a monotonic request clock.
 * [OUTPUT]: Bounded token, HTTP and body waits with actual transport cancellation.
 * [POS]: Shared transport lifetime; it owns all listeners and timers for one RPC.
 */
import { SyncFailure } from './failure'
import type { SyncRemote } from './remote'

export interface SyncClock {
  now(): number
  after(ms: number, callback: () => void): () => void
}

export const syncClock: SyncClock = {
  now: () => performance.now(),
  after: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

export interface RequestOptions { signal?: AbortSignal }

export const requestLimits = { status: 5_000, metadata: 10_000, pull: 15_000, write: 30_000, turn: 60_000 } as const

const contextPosition = {
  finishInitialization: 1, registerDevice: 1, rebindDevice: 3, account: 0, bootstrap: 1, putEnvelopes: 3,
  getEnvelopes: 2, getCheckpoint: 2, getRoster: 2, getSyncStatus: 2, receiptsFor: 3,
  startRecovery: 2, completeRecovery: 1, pushOps: 1, pullOps: 1, resetSync: 1,
} satisfies Record<keyof SyncRemote, number>

/** Shared setup workflows keep the lifetime they started with across all RPCs. */
export function scopedRemote(remote: SyncRemote, signal: AbortSignal): SyncRemote {
  return new Proxy(remote, { get(target, key: keyof SyncRemote) {
    if (!Object.hasOwn(contextPosition, key)) return Reflect.get(target, key)
    const method = target[key]
    return (...args: unknown[]) => {
      if (signal.aborted) return Promise.reject(new SyncFailure('cancelled'))
      const position = contextPosition[key]
      const options = args[position] as RequestOptions | undefined
      args[position] = { ...options, signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }
      return Reflect.apply(method, target, args)
    }
  } })
}

export async function boundedRequest<T>(input: {
  ms: number; clock: SyncClock; signals: (AbortSignal | undefined)[]
}, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort(new SyncFailure('cancelled'))
  const expire = input.clock.after(input.ms, () => controller.abort(new SyncFailure('timeout')))
  for (const signal of input.signals) {
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
  }
  let rejectAbort: () => void = () => {}
  try {
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
      if (controller.signal.aborted) rejectAbort()
    })
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return work(controller.signal)
    })])
  } finally {
    expire()
    controller.signal.removeEventListener('abort', rejectAbort)
    for (const signal of input.signals) signal?.removeEventListener('abort', cancel)
  }
}
