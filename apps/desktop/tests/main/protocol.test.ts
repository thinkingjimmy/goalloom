import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { appProtocol, isGoalloomProtocol, protocolRegistration, protocolUrlFromArgv, secondInstanceFocus, signedInUrl } from '../../src/main/protocol'

const { load } = createRequire(import.meta.url)('js-yaml') as { load: (source: string) => unknown }

function protocols(text: string, section: 'mac' | 'win'): { name?: string, schemes?: string[] }[] {
  const doc = load(text)
  if (typeof doc !== 'object' || doc === null) throw new Error('electron-builder config is empty')
  const block = (doc as Record<string, unknown>)[section]
  if (typeof block !== 'object' || block === null || !('protocols' in block)) throw new Error(`missing ${section} section`)
  const list = (block as { protocols?: unknown }).protocols
  if (!Array.isArray(list)) throw new Error(`missing ${section} protocols`)
  return list as { name?: string, schemes?: string[] }[]
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
  const configPath = fileURLToPath(new URL('../../electron-builder.yml', import.meta.url))
  expect(configPath.endsWith(`${path.sep}apps${path.sep}desktop${path.sep}electron-builder.yml`)).toBe(true)
  // Windows checkout of this test file. path.win32 folds `..` the same way fileURLToPath does on Windows.
  const windowsTest = 'D:\\runner\\work\\goalloom\\goalloom\\apps\\desktop\\tests\\main\\protocol.test.ts'
  expect(path.win32.join(path.win32.dirname(windowsTest), '..', '..', 'electron-builder.yml')).toBe('D:\\runner\\work\\goalloom\\goalloom\\apps\\desktop\\electron-builder.yml')
  expect(new URL('../../electron-builder.yml', 'file:///D:/runner/work/goalloom/goalloom/apps/desktop/tests/main/protocol.test.ts').pathname)
    .toBe('/D:/runner/work/goalloom/goalloom/apps/desktop/electron-builder.yml')

  const source = readFileSync(configPath, 'utf8')
  // Normalize first. Replacing `\n` in an already-CRLF checkout yields `\r\r\n` (`mac:\r`), which the line matcher rejected.
  const lf = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const windowsCheckout = lf.replace(/\n/g, '\r\n')
  const doubledCarriageReturn = windowsCheckout.replace(/\n/g, '\r\n')
  for (const text of [source, windowsCheckout, doubledCarriageReturn]) {
    for (const name of ['mac', 'win'] as const) {
      expect(protocols(text, name)).toEqual([{ name: 'Goalloom', schemes: ['goalloom'] }])
    }
  }
})
