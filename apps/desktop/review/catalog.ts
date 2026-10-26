/**
 * [INPUT]: Current product message catalogs and lightweight error identifiers.
 * [OUTPUT]: Source-linked error inventory and deterministic review scenes.
 * [POS]: Review-only catalog; error copy is read from the product, never rewritten here.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { serverText } from '../src/shared/i18n/server'
import { aiFailureKinds } from '../src/shared/contracts/values'
import { currentLocale, messages, settingsMessages, insightMessages } from '../src/renderer/i18n'
import type { FailureKind } from '../src/shared/contracts/smart-input'
import { nestingText } from '../src/shared/i18n/nesting'
import { smartMessages } from '../src/renderer/i18n'
import { isServiceFailureCode } from '@goalloom/contracts'
import { billingCatalog, serviceCopyKeys } from '../src/shared/i18n/billing'

export type Surface = 'banner' | 'notice' | 'future' | 'past' | 'picker' | 'backlog' | 'search' | 'detail' | 'assist' | 'composer' | 'quick' | 'provider' | 'ai' | 'hosted' | 'settings' | 'items' | 'sync' | 'password' | 'recovery' | 'signout' | 'sync-review' | 'review' | 'seed' | 'start' | 'shortcuts' | 'link' | 'native' | 'flow' | 'nest' | 'feature' | 'toast'
export interface Scenario { id: string; group: string; title: string; surface: Surface; message: string; source: string; code?: string; failure?: FailureKind }
const sourceRoot = 'apps/desktop/src/'
export function buildScenarios(): Scenario[] {
const entries: Scenario[] = []
const add = (id: string, group: string, title: string, surface: Surface, message: string, source: string, code?: string) => entries.push({ id, group, title: title === code && message ? message.split(/[，。；]/u)[0]! : title, surface, message, source: sourceRoot + source, ...(code ? { code } : {}) })
const textOf = (value: unknown): string => typeof value === 'function' ? String(value('示例目标', 503)) : String(value)
const read = serverText()

for (const [code, value] of Object.entries(read.errors)) {
  const transfer = /file|database|import|backup|previewExpired|changedAfterBackup|nativePicker/i.test(code)
  add(`operation-${code}`, transfer ? '备份与恢复' : '看板操作', code, transfer ? 'settings' : 'banner', textOf(value), 'shared/i18n/catalogs/zh/app.ts', code)
}
for (const [code, value] of Object.entries(read.relations)) add(`relation-${code}`, '关系与层级', code, 'banner', textOf(value), 'shared/i18n/catalogs/zh/app.ts', code)
for (const code of ['levels', 'cycle', 'changed', 'expired'] as const) add(`nest-rule-${code}`, '关系与层级', code, 'banner', nestingText()[code], 'shared/i18n/nesting.ts', code)
for (const code of ['search', 'unlink'] as const) add(`flow-${code}`, '关系与层级', code === 'search' ? '看板流程菜单 · 搜索失败' : '看板流程菜单 · 解除关联失败', 'flow', code === 'search' ? messages.relationSearchFailed : messages.unlinkFailed, 'renderer/features/board/FlowDot.tsx', code)
for (const code of ['search', 'changed'] as const) add(`nest-picker-${code}`, '关系与层级', code === 'search' ? '主任务选择 · 搜索失败' : '主任务选择 · 分组已变化', 'nest', code === 'search' ? messages.relationSearchFailed : nestingText().changed, 'renderer/features/board/NestingPicker.tsx', code)
for (const [code, value] of Object.entries(read.undo)) add(`undo-${code}`, '撤销', code, 'banner', messages.undoConflict(textOf(value)), 'shared/i18n/catalogs/zh/app.ts', code)

for (const code of ['saveUnknown', 'refreshFailed', 'autosaveFailed', 'restoreItemFailed'] as const) add(`board-${code}`, '看板操作', code, 'banner', messages[code], 'renderer/state/use-workspace.ts', code)
add('notice-clock', '看板提示', '系统时间异常', 'notice', messages.clockWarning, 'renderer/App.tsx', 'clock')
add('notice-timezone', '看板提示', '设备与工作区时区不同', 'notice', messages.timezoneMismatch, 'renderer/App.tsx', 'timezone')
add('notice-restore', '看板提示', '恢复后暂停顺延', 'notice', messages.restorePaused, 'renderer/App.tsx', 'restore')
add('notice-backup', '看板提示', '自动备份失败', 'notice', read.storage.backupFailed, 'renderer/App.tsx', 'backup')
add('toast-color', '看板提示', '部分还原 · 流程颜色被占用', 'toast', read.warnings.restoreColorTaken('示例目标'), 'renderer/App.tsx', 'color')
add('toast-relation', '看板提示', '部分还原 · 关联无法恢复', 'toast', read.warnings.relationNotRestored(read.warnings.endpointInTrash), 'renderer/App.tsx', 'relation')
add('toast-nesting', '看板提示', '部分还原 · 原分组已变化', 'toast', nestingText().restored, 'renderer/App.tsx', 'nesting')
add('board-future', '周期与历史', '未来周期加载失败', 'future', messages.planningLoadFailed, 'renderer/features/board/Board.tsx')
add('board-past', '周期与历史', '往期任务加载失败', 'past', messages.planningLoadFailed, 'renderer/features/board/PastPeriod.tsx')
add('board-picker', '周期与历史', '周期记录加载失败', 'picker', '', 'renderer/features/board/PeriodPicker.tsx')
add('board-backlog', '周期与历史', '积压列表加载失败', 'backlog', messages.backlogFailed, 'renderer/features/board/Backlog.tsx')
add('search-failed', '搜索与详情', '搜索读取失败', 'search', messages.searchFailed, 'renderer/features/shell/CommandPalette.tsx')
for (const code of ['load', 'save', 'unknown', 'relation'] as const) add(`detail-${code}`, '搜索与详情', `任务详情 · ${code}`, 'detail', code === 'load' ? messages.itemFailed : code === 'relation' ? messages.relationSearchFailed : code === 'unknown' ? messages.saveUnknown : messages.autosaveFailed, 'renderer/features/items/use-item-autosave.ts', code)
for (const code of ['prepare', 'unavailable', 'too_large', 'stale', 'failed'] as const) add(`assist-${code}`, '笔记辅助', code, 'assist', '', 'renderer/features/assistance/AssistancePanel.tsx', code)

for (const failure of aiFailureKinds) {
  const message = isServiceFailureCode(failure) ? billingCatalog[currentLocale()][serviceCopyKeys[failure]]
    : read.smart.failures[failure]('OpenRouter', failure === 'request_failed' ? 503 : null)
  for (const [surface, group] of [['composer', '智能新建'], ['quick', '列内智能输入'], ['provider', 'AI 连接测试']] as const) {
    entries.push({ id: `${surface}-${failure}`, group, title: message.split(/[，。；（]/u)[0]!, surface, message, failure, source: sourceRoot + (surface === 'provider' ? 'renderer/features/smart/ProviderConnect.tsx' : surface === 'quick' ? 'renderer/features/board/QuickAdd.tsx' : 'renderer/features/composer/Composer.tsx') })
  }
}
for (const code of ['unreadable', 'unavailable', 'failure', 'paused', 'missing'] as const) add(`ai-${code}`, 'AI 设置', code, 'ai', '', 'renderer/features/shell/settings/AiPane.tsx', code)
for (const code of ['paused', 'unreadable', 'cooldown', 'missing'] as const) add(`feature-${code}`, 'AI 设置', `智能输入 · ${code}`, 'feature', '', 'renderer/features/shell/settings/FeatureControls.tsx', code)
add('ai-unsigned', 'AI 设置', '未签名构建的凭据提示', 'ai', smartMessages.unsigned, 'renderer/features/shell/settings/AiPane.tsx', 'unsigned')
add('ai-remove', 'AI 设置', '移除服务将影响已启用的功能', 'ai', '', 'renderer/features/shell/settings/AiPane.tsx', 'remove')
add('hosted-consent', 'AI 设置', '托管 AI 授权失败', 'hosted', '', 'renderer/features/shell/settings/HostedAiSettings.tsx')
for (const code of ['status', 'backup', 'export', 'import', 'reset', 'prepare', 'commit', 'cancel'] as const) add(`backup-${code}`, '备份与恢复', code, 'settings', code === 'status' ? messages.backupStatusFailed : code === 'export' ? messages.exportUnknown : read.storage.backupFailed, 'renderer/features/shell/settings/Settings.tsx', code)
for (const code of ['done', 'cancelled', 'archived', 'trash'] as const) add(`items-${code}`, '设置列表', `${code} 列表加载失败`, 'items', messages.listFailed, 'renderer/features/shell/settings/ItemsPane.tsx', code)
add('update-failed', '软件更新', '检查 / 下载更新失败', 'settings', settingsMessages.about.failed, 'renderer/features/shell/settings/AboutPane.tsx', 'update')
for (const [code, message] of Object.entries(settingsMessages.sync.errors)) add(`sync-${code}`, '同步', code, 'sync', message, 'renderer/features/shell/settings/SyncPane.tsx', code)
for (const code of ['offline', 'quota', 'paused', 'locked', 'request'] as const) add(`sync-${code}`, '同步', code, 'sync', '', 'renderer/features/shell/settings/SyncPane.tsx', code)
for (const code of ['mismatch', 'failed'] as const) add(`password-${code}`, '同步密码', `修改密码 · ${code}`, 'password', '', 'renderer/features/shell/settings/SyncPasswordDialog.tsx', code)
for (const code of ['new', 'destructive'] as const) add(`recovery-${code}`, '同步密码', `密码恢复 · ${code}`, 'recovery', settingsMessages.sync.errors.storage, 'renderer/features/shell/settings/SyncRecovery.tsx', code)
add('signout-failed', '同步密码', '退出并清理本机数据失败', 'signout', settingsMessages.sync.errors.storage, 'renderer/features/shell/settings/SyncSignOutDialog.tsx')
for (const code of ['load', 'save', 'stale'] as const) add(`sync-review-${code}`, '同步差异', code, 'sync-review', code === 'stale' ? settingsMessages.sync.reviewUpdated : settingsMessages.sync.reviewFailed, 'renderer/features/sync/SyncReview.tsx', code)
for (const code of ['load', 'save', 'summary', 'refresh', 'draft'] as const) add(`review-${code}`, '流程洞察', `复盘 · ${code}`, 'review', code === 'load' ? insightMessages.reviewLoadFailed : code === 'save' ? insightMessages.reviewSaveFailed : insightMessages.summaryFailed, 'renderer/features/insight/ReviewDrawer.tsx', code)
add('seed-failed', '流程洞察', '拆解下一步起草失败', 'seed', insightMessages.generateFailed, 'renderer/features/composer/Seeded.tsx')
for (const code of ['network', 'password', 'auth', 'port', 'storage', 'configuration'] as const) add(`start-${code}`, '首次使用', code, 'start', settingsMessages.sync.errors[code], 'renderer/features/setup/StartGate.tsx', code)
add('shortcut-conflict', '快捷键', '快捷键冲突', 'shortcuts', '', 'renderer/features/shell/settings/ShortcutsPane.tsx')
add('link-failed', '链接', '外部链接打开失败（悬停提示与读屏反馈）', 'link', messages.linkOpenFailed, 'renderer/components/links/LinkText.tsx')
for (const code of ['openFailed', 'backupBeforeUpgradeFailed', 'upgradeCheckFailed', 'changedAfterBackup', 'upgradeFailed', 'readOnlyFailed', 'newerVersion', 'unsupportedVersion', 'incompleteSchema', 'unreadable', 'corruptRecords', 'initFailed', 'unsupportedDatabase', 'backupMismatch', 'integrityFailed', 'danglingReferences'] as const) add(`native-${code}`, '原生系统弹窗', code, 'native', read.storage[code], 'main/index.ts', code)
add('native-startupUnavailable', '原生系统弹窗', '本地存储服务未能启动', 'native', read.dialogs.startupUnavailable, 'main/index.ts', 'startupUnavailable')
add('native-unsaved', '原生系统弹窗', '关闭时仍有未保存内容', 'native', read.dialogs.unsavedMessage, 'main/window/close.ts', 'unsaved')
return entries
}
export const scenarios = buildScenarios()
export const groups = [...new Set(scenarios.map(entry => entry.group))]
export const findScenario = (id: string) => scenarios.find(entry => entry.id === id) ?? scenarios.find(entry => entry.id === 'board-saveUnknown')!
