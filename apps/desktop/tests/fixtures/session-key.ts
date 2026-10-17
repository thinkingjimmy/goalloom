/**
 * [INPUT]: The isolated fixture's built native-module URL.
 * [OUTPUT]: A deterministic synthetic session key without reading the system credential store.
 * [POS]: Shared native-window fixture boundary; production cipher and session files remain real.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export function installSessionKey(url: URL): void {
  if (process.platform !== 'darwin') return
  const native = createRequire(import.meta.url)(fileURLToPath(url)) as { sessionKey: () => Buffer }
  native.sessionKey = () => Buffer.alloc(32, 0x6d)
}
