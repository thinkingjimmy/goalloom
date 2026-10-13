/**
 * [INPUT]: Whether this process is the unpackaged Electron binary, and the launch argv.
 * [OUTPUT]: Arguments for app.setAsDefaultProtocolClient, and the goalloom:// URL a second instance received.
 * [POS]: OS handoff back to the running desktop window. In-app pages stay on the privileged goalloom://app handler.
 */
export const appProtocol = 'goalloom'
export const signedInUrl = `${appProtocol}://signed-in`

export interface ProtocolRegistration {
  scheme: typeof appProtocol
  command?: string
  args?: string[]
}

/** Packaged builds register the scheme alone. `electron .` must pass the executable and the app entry. */
export function protocolRegistration(input: { defaultApp: boolean; execPath: string; entry?: string }): ProtocolRegistration {
  if (input.defaultApp && input.entry) return { scheme: appProtocol, command: input.execPath, args: [input.entry] }
  return { scheme: appProtocol }
}

export function isGoalloomProtocol(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === `${appProtocol}:` && url.username === '' && url.password === ''
  } catch { return false }
}

/** Windows puts the protocol URL on the second instance argv. Other arguments are ignored. */
export function protocolUrlFromArgv(argv: readonly string[]): string | null {
  return argv.find(isGoalloomProtocol) ?? null
}

/** A second process returns to the open window. A goalloom:// argument is that handoff, not a page to load. */
export function secondInstanceFocus(argv: readonly string[]): boolean {
  const url = protocolUrlFromArgv(argv)
  return url === null || isGoalloomProtocol(url)
}
