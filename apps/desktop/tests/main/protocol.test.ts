import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { appProtocol, isGoalloomProtocol, protocolRegistration, protocolUrlFromArgv, secondInstanceFocus, signedInUrl } from '../../src/main/protocol'

function platformBlock(source: string, name: string): string {
  // `* text=auto` checks this file out as CRLF on Windows. A raw `mac:\r` never equals `mac:`.
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(line => line === `${name}:`)
  if (start < 0) throw new Error(`missing ${name} section`)
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) break
    body.push(line)
  }
  return body.join('\n')
}

it('打包应用只注册 goalloom，开发时把 Electron 入口一并交给系统', () => {
  expect(protocolRegistration({ defaultApp: false, execPath: '/Applications/Goalloom.app/Contents/MacOS/Goalloom' })).toEqual({ scheme: appProtocol })
  expect(protocolRegistration({ defaultApp: true, execPath: '/usr/bin/electron', entry: '/repo/apps/desktop/out/main/index.js' })).toEqual({
    scheme: appProtocol, command: '/usr/bin/electron', args: ['/repo/apps/desktop/out/main/index.js'],
  })
  expect(protocolRegistration({ defaultApp: true, execPath: '/usr/bin/electron' })).toEqual({ scheme: appProtocol })
})

it('只把 goalloom:// 当成唤回链接', () => {
  expect(signedInUrl).toBe('goalloom://signed-in')
  expect(isGoalloomProtocol(signedInUrl)).toBe(true)
  expect(isGoalloomProtocol('goalloom://app/index.html')).toBe(true)
  expect(isGoalloomProtocol('goalloom://user:secret@signed-in')).toBe(false)
  expect(isGoalloomProtocol('https://goalloom.com/')).toBe(false)
  expect(isGoalloomProtocol('not a url')).toBe(false)
  expect(protocolUrlFromArgv(['Goalloom.exe', '--allow-file-access-from-files', signedInUrl])).toBe(signedInUrl)
  expect(protocolUrlFromArgv(['Goalloom.exe', 'https://evil.example/goalloom://signed-in'])).toBeNull()
})

it('Windows 第二次启动会回到已打开的窗口，包括协议唤回', () => {
  expect(secondInstanceFocus(['Goalloom.exe', signedInUrl])).toBe(true)
  expect(secondInstanceFocus(['Goalloom.exe'])).toBe(true)
  expect(secondInstanceFocus(['Goalloom.exe', 'goalloom://user:secret@signed-in'])).toBe(true)
})

it('mac 和 win 的 electron-builder 配置都声明 goalloom 协议', () => {
  const source = readFileSync(fileURLToPath(new URL('../../electron-builder.yml', import.meta.url)), 'utf8')
  for (const text of [source, source.replace(/\n/g, '\r\n')]) {
    for (const name of ['mac', 'win']) {
      const block = platformBlock(text, name)
      expect(block).toContain('protocols:')
      expect(block).toContain('name: Goalloom')
      expect(block).toContain('schemes: [goalloom]')
    }
  }
})
