/**
 * [INPUT]: The production mobile shape catalog and real accepted animation requests.
 * [OUTPUT]: A repeatable nine-shape sequence for native recording, without changing particle motion.
 * [POS]: Metro substitute in explicit iOS E2E bundles only; never part of production resolution.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { celebrationShapes } from '../src/celebration-shape'

let next = 0
export function chooseCelebrationShape() {
  console.info('Native decoration E2E sequence', next)
  return celebrationShapes[next++ % celebrationShapes.length] ?? null
}
