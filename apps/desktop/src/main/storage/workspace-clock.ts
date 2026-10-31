/**
 * [INPUT]: Native Date primitives without configuration or external clock controls.
 * [OUTPUT]: Workspace observation instants and calendar scheduler milliseconds.
 * [POS]: Shared main/worker workspace time dependency; other service clocks stay independent.
 */
import type { Clock } from '../../domain/calendar'

export const workspaceClock: Clock & { nowMs(): number } = Object.freeze({
  now: () => new Date().toISOString(),
  nowMs: () => Date.now(),
})
