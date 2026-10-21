import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { SyncStatus } from '../../src/shared/contracts/sync'
import { passwordReady, startScreen } from '../../src/renderer/features/setup/entry'
import { ChoiceScreen, NewPasswordScreen, SyncingScreen } from '../../src/renderer/features/setup/StartScreens'
import { StartGate } from '../../src/renderer/features/setup/StartGate'
import { Setup } from '../../src/renderer/features/setup/Setup'
import { en } from '../../src/renderer/i18n/locales/en'
import { es } from '../../src/renderer/i18n/locales/es'
import { fr } from '../../src/renderer/i18n/locales/fr'
import { ja } from '../../src/renderer/i18n/locales/ja'
import { zh } from '../../src/renderer/i18n/locales/zh'

const calendarTitle = zh.calendar.chooseCalendar
const authNotice = zh.settings.sync.errors.auth

function status(partial: Partial<SyncStatus> & Pick<SyncStatus, 'phase'>): SyncStatus {
  return { email: 'jimmy@example.com', pending: 0, conflicts: 0, paused: null, lastSyncedAt: null, error: null, localItems: 0, offline: false, syncing: false, ...partial }
}

function gate(partial: Partial<SyncStatus> & Pick<SyncStatus, 'phase'>): string {
  return renderToStaticMarkup(createElement(StartGate, {
    status: status(partial),
    busy: false,
    errorCode: null,
    confirm: async () => false,
    sync: async () => ({ status: status(partial) }),
  }))
}

it('选择页、内联等待和返回后的登录失败都不出现登录提示', () => {
  const choice = gate({ phase: 'signed-out', email: null, error: 'auth' })
  expect(choice).toContain('怎么开始？')
  expect(choice).toContain('直接使用')
  expect(choice).toContain('看板只存在这台设备上')
  expect(choice).toContain('用 Google 登录')
  expect(choice).toContain('在多台设备间加密同步')
  expect(choice).toContain(authNotice)
  expect(choice).not.toContain(calendarTitle)

  const waiting = renderToStaticMarkup(createElement(ChoiceScreen, { waiting: true, onLocal: () => undefined, onSignIn: () => undefined, onCancel: () => undefined }))
  expect(waiting).toContain('在浏览器中继续…')
  expect(waiting).toContain('取消')
  expect(waiting).toContain('data-dim="true"')
  expect(waiting).not.toContain('在多台设备间加密同步')
  expect(waiting).not.toContain(authNotice)
  expect(gate({ phase: 'signing-in' })).toContain('在浏览器中继续…')
  expect(gate({ phase: 'signing-in', error: 'auth' })).not.toContain(authNotice)
})

it('加入设备只出现同步密码，不出现设置向导', () => {
  expect(startScreen({ direct: false, passwordReady: false, joining: false, phase: 'enter-key', error: null })).toBe('join')
  expect(startScreen({ direct: false, passwordReady: false, joining: true, phase: 'enter-key', error: null })).toBe('syncing')
  expect(startScreen({ direct: false, passwordReady: false, joining: true, phase: 'ready', error: null })).toBe('syncing')
  expect(startScreen({ direct: false, passwordReady: true, joining: false, phase: 'enter-key', error: null })).not.toBe('setup')
  const join = gate({ phase: 'enter-key' })
  expect(join).toContain('输入同步密码')
  expect(join).toContain('使用在第一台设备上设置的密码。')
  expect(join).toContain('忘记密码…')
  expect(join).toContain('返回')
  expect(join).not.toContain(calendarTitle)
  const wrong = gate({ phase: 'enter-key', error: 'password' })
  expect(wrong).toContain('密码不对')
  expect(wrong).not.toContain(calendarTitle)
  expect(renderToStaticMarkup(createElement(SyncingScreen))).toContain('正在同步看板…')
  expect(renderToStaticMarkup(createElement(SyncingScreen))).not.toContain('128 / 206')
})

it('blocks first-device setup when passwords do not match', () => {
  expect(passwordReady('short', 'short')).toBe(false)
  expect(passwordReady('sync-pass', 'other-pass')).toBe(false)
  expect(passwordReady('sync-pass', 'sync-pass')).toBe(true)
  expect(startScreen({ direct: true, passwordReady: false, joining: false, phase: 'signed-out', error: null })).toBe('setup')
  expect(startScreen({ direct: false, passwordReady: false, joining: false, phase: 'setup', error: null })).toBe('password')
  expect(startScreen({ direct: false, passwordReady: true, joining: false, phase: 'setup', error: null })).toBe('setup')
  const blank = renderToStaticMarkup(createElement(NewPasswordScreen, { email: 'jimmy@example.com', busy: false, onBack: () => undefined, onContinue: () => undefined }))
  expect(blank).toContain('设置同步密码')
  expect(blank).toContain('至少 8 位')
  expect(blank).toContain('再输入一次')
  expect(blank).toContain('其他设备用它加入。密码无法找回。')
  expect(disabledButton(blank, '继续')).toBe(true)
  const mismatch = renderToStaticMarkup(createElement(NewPasswordScreen, {
    email: 'jimmy@example.com', busy: false, onBack: () => undefined, onContinue: () => undefined, initialPassword: 'sync-pass', initialAgain: 'other-pass',
  }))
  expect(mismatch).toContain('两次输入不一致')
  expect(disabledButton(mismatch, '继续')).toBe(true)
  const local = renderToStaticMarkup(createElement(Setup, { confirm: () => undefined, busy: false, errorCode: null, back: () => undefined }))
  expect(local).toContain(calendarTitle)
  expect(local).toContain('上一步')
  const synced = renderToStaticMarkup(createElement(Setup, { confirm: () => undefined, busy: false, errorCode: null }))
  expect(synced).toContain(calendarTitle)
  expect(synced).not.toContain('上一步')
})

function disabledButton(html: string, label: string): boolean {
  const tag = html.match(new RegExp(`<button\\b[^>]*>${label}</button>`))?.[0] ?? ''
  return tag.includes(' disabled=""')
}

it('五种语言都有开始页文案，中文与定稿一致', () => {
  expect(zh.messages.start.mismatch).toBe('两次输入不一致')
  expect(zh.messages.start.browser).toBe('在浏览器中继续…')
  for (const catalog of [en, ja, es, fr]) {
    expect(catalog.messages.start.title.length).toBeGreaterThan(0)
    expect(catalog.messages.start.mismatch).not.toBe(zh.messages.start.mismatch)
  }
})
