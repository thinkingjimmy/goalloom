import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { SyncStatus } from '../../src/shared/contracts/sync'
import { SyncPane, syncNavBadge } from '../../src/renderer/features/shell/settings/SyncPane'
import { en } from '../../src/renderer/i18n/locales/en'
import { es } from '../../src/renderer/i18n/locales/es'
import { fr } from '../../src/renderer/i18n/locales/fr'
import { ja } from '../../src/renderer/i18n/locales/ja'
import { zh } from '../../src/renderer/i18n/locales/zh'

const banned = '密码只保存在你的设备上，忘记后无法找回云端数据。'

function status(partial: Partial<SyncStatus> & Pick<SyncStatus, 'phase'>): SyncStatus {
  return { email: null, pending: 0, conflicts: 0, paused: null, lastSyncedAt: null, error: null, localItems: 0, offline: false, syncing: false, ...partial }
}

function page(partial: Partial<SyncStatus> & Pick<SyncStatus, 'phase'>): string {
  return renderToStaticMarkup(createElement(SyncPane, { status: status(partial), timezone: 'UTC', today: '2026-10-13' }))
}

it('七种同步状态都是普通设置行，状态和退出登录在同一行', () => {
  const signedOut = page({ phase: 'signed-out' })
  expect(signedOut).toContain('Google 账号')
  expect(signedOut).toContain('未登录')
  expect(signedOut).toContain('使用 Google 登录')
  expect(signedOut).not.toContain('退出登录')

  const setup = page({ phase: 'setup', email: 'jimmy@example.com' })
  expect(setup).toContain('jimmy@example.com')
  expect(setup).toContain('退出登录')
  expect(setup).toContain('至少 8 位')
  expect(setup).toContain('再输入一次')
  expect(setup).toContain('开始同步')
  expect(setup).not.toContain(banned)

  const enter = page({ phase: 'enter-key', email: 'jimmy@example.com' })
  expect(enter).toContain('忘记密码…')
  expect(enter).toContain('继续')
  expect(enter).toContain('type="password"')

  const choose = page({ phase: 'choose', email: 'jimmy@example.com', localItems: 2 })
  expect(choose).toContain('本机已有条目')
  expect(choose).toContain('使用另一台电脑的看板')
  expect(choose).toContain('合并两边的条目')
  expect(choose).not.toContain('type="radio"')
  expect(choose).toContain('合并并开始同步')
  expect(choose).toContain('自动备份')

  const synced = page({ phase: 'ready', email: 'jimmy@example.com', lastSyncedAt: '2026-10-13T15:28:00.000Z' })
  expect(synced).toContain('已同步')
  expect(synced).toContain('上次同步 今天 15:28')
  expect(synced).toContain('更改…')
  expect(synced).toContain('忘记同步密码？')
  expect(synced).toContain('忘记密码…')
  expect(synced).not.toContain('重试')
  expect(syncNavBadge(status({ phase: 'ready', email: 'jimmy@example.com' }))).toEqual({ text: '已同步', dot: true })

  const syncing = page({ phase: 'ready', email: 'jimmy@example.com', syncing: true })
  expect(syncing).toContain('正在同步…')
  expect(syncing).toMatch(/<button[^>]*disabled[^>]*>更改…<\/button>/)
  expect(syncing).toContain('忘记密码…')
  expect(syncNavBadge(status({ phase: 'ready', syncing: true }))).toEqual({ text: '同步中' })

  const failed = page({ phase: 'ready', email: 'jimmy@example.com', offline: true, error: 'network', lastSyncedAt: '2026-10-13T09:12:00.000Z' })
  expect(failed).toContain('网络不可用')
  expect(failed).toContain('上次同步 今天 09:12')
  const actions = failed.match(/<div class="[^"]*\bsync-row-actions\b[^"]*">[\s\S]*?<\/div>/)?.[0] ?? ''
  expect(actions).toContain('重试')
  expect(actions).toContain('退出登录')
  expect(syncNavBadge(status({ phase: 'ready', offline: true, error: 'network' }))).toEqual({ text: '出错', dot: 'err' })

  const locked = page({ phase: 'locked', email: 'jimmy@example.com' })
  expect(locked).toContain('同步已关闭')
  expect(locked).toContain('钥匙串不可用')
  expect(locked).toMatch(/<button[^>]*disabled[^>]*>更改…<\/button>/)
  expect(syncNavBadge(status({ phase: 'locked', email: 'jimmy@example.com' }))).toEqual({ text: '已关闭', dot: 'err' })
})

it('同步差异使用中性提醒，并提供独立查看入口', () => {
  const markup = page({ phase: 'ready', email: 'jimmy@example.com', conflicts: 3, lastSyncedAt: '2026-10-13T15:28:00.000Z' })
  expect(markup).toContain('有 3 项任务需要确认同步结果')
  expect(markup).toContain('查看详情')
  expect(markup).toContain('关闭提示')
  expect(markup).not.toContain('幸存的条目')
  expect(page({ phase: 'ready', email: 'jimmy@example.com', conflicts: 0 })).not.toContain('没有同步')
  for (const catalog of [zh, en, ja, es, fr]) {
    expect(catalog.settings.sync.conflicts(3)).not.toMatch(/幸存|surviving|残った項目|elementos que quedan|éléments restants/)
  }
  expect(en.settings.sync.conflicts(1)).toContain('1 change did not sync')
})

it('重试和退出登录的间距是 8px，并且不出现已删除的密码提示', () => {
  const css = readFileSync(new URL('../../src/renderer/features/shell/settings/settings.css', import.meta.url), 'utf8')
  expect(css).toMatch(/\.sync-row-actions, \.sync-end \{[^}]*gap: 8px/)
  for (const catalog of [zh, en, ja, es, fr]) expect(JSON.stringify(catalog.settings.sync)).not.toContain(banned)
  expect(page({ phase: 'setup', email: 'jimmy@example.com' })).not.toContain(banned)
})
