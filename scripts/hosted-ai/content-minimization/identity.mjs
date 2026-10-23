/**
 * [INPUT]: The original action creation time and cryptographic randomness.
 * [OUTPUT]: UUIDv7 action identities with a server-verifiable, nonrenewable replay window.
 * [POS]: Manual acceptance identity helper; no model call or credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
export function actionId(now = Date.now()) {
  const time=now.toString(16).padStart(12,'0'),random=randomUUID()
  return `${time.slice(0,8)}-${time.slice(8)}-7${random.slice(15,18)}-${random.slice(19)}`
}
