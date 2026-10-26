/**
 * [INPUT]: One review scenario and synthetic read models.
 * [OUTPUT]: Finite in-memory GoalloomApi with controlled failures and safe retry recovery.
 * [POS]: Replaces preload only in app.html; never imports main or opens external resources.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { GoalloomApi } from '../src/shared/contracts/runtime'
import type { SmartReply } from '../src/shared/contracts/smart-input'
import type { AssistancePrepared } from '../src/shared/contracts/assistance'
import type { SyncStatus } from '../src/shared/contracts/sync'
import type { Scenario } from './catalog'
import { fixture, smartStatus, syncStatus, generation, now, calendar, facts } from './fixtures'
import { serverText } from '../src/shared/i18n/server'
import { reviewDue } from '../src/renderer/features/insight/review'

export function installBridge(scene: Scenario, style: 'paper' | 'minimal' | 'macos', theme: 'light' | 'dark') {
  const snapshot = fixture(), ai = smartStatus(), sync = syncStatus()
  const closingPeriod = reviewDue(snapshot, [])[0]!.week!.period
  const closing = { ...snapshot.items.find(item => item.id === 'week-goal')!, placement: { ...snapshot.items.find(item => item.id === 'week-goal')!.placement, periodId: closingPeriod.id } }
  let reviewCalls = 0
  snapshot.workspace.style = style; snapshot.workspace.theme = theme
  let recovered = false
  const changed = new Set<Parameters<GoalloomApi['onChanged']>[0]>()
  const syncing = new Set<(status: SyncStatus) => void>()
  const noop = () => () => undefined
  const fail = () => { throw new Error(scene.message || serverText().storage.failed) }
  const failure = () => ({ kind: scene.failure ?? 'unavailable' as const, message: scene.message || serverText().smart.failures.unavailable(), status: scene.failure === 'request_failed' ? 503 : null, retryAt: null })
  if (scene.surface === 'notice') {
    if (scene.code === 'clock') snapshot.workspace.clockAnomaly = true
    if (scene.code === 'restore') snapshot.workspace.pausedAfterRestore = true
    if (scene.code === 'backup') snapshot.backupError = scene.message
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    snapshot.workspace.calendar!.timezone = scene.code === 'timezone' ? deviceZone === 'Asia/Singapore' ? 'Europe/Paris' : 'Asia/Singapore' : deviceZone
  }
  if (['sync', 'start'].includes(scene.surface)) {
    sync.error = scene.code && scene.code in { network: 1, password: 1, auth: 1, key: 1, mismatch: 1, busy: 1, port: 1, storage: 1, cleanup: 1, configuration: 1 } ? scene.code as SyncStatus['error'] : null
    if (scene.code === 'password') sync.phase = 'enter-key'
    if (scene.code === 'auth' || scene.code === 'port' || scene.code === 'cleanup') sync.phase = 'signed-out'
    if (scene.code === 'locked') { sync.phase = 'locked'; sync.error = 'storage' }
    if (scene.code === 'offline') sync.offline = true
    if (scene.code === 'request') sync.error = 'network'
    if (scene.code === 'quota') { sync.pending = 3; sync.uploadWait = { retryAt: '2099-10-23T05:00:00Z', reason: 'quota' } }
    if (scene.code === 'paused') sync.paused = 'Review fixture: sync paused'
  }
  if (scene.surface === 'start') { snapshot.workspace.setupConfirmedAt = null; if (scene.code !== 'password') sync.phase = 'signed-out' }
  if (scene.surface === 'sync-review') sync.conflicts = 2
  if (scene.surface === 'ai' || scene.surface === 'feature') {
    if (scene.code === 'unreadable' || scene.code === 'unavailable') ai.providers.openrouter.credential = scene.code
    if (scene.code === 'failure') ai.providers.openrouter.lastFailure = failure()
    if (scene.code === 'missing') { ai.providers.openrouter.credential = 'missing'; ai.features.smart.enabled = false }
    if (scene.code === 'paused') { ai.features.smart.enabled = false; ai.features.smart.paused = true }
    if (scene.code === 'cooldown') ai.providers.openrouter.cooldownUntil = '2099-10-23T04:00:00Z'
    if (scene.code === 'unsigned') ai.unsignedBuild = true
  }
  if (scene.surface === 'hosted') { ai.hostedAccountId = generation; ai.hostedEligible = true }
  const backupStatus = { directory: '/Review/Goalloom/backups', records: [], lastError: scene.code === 'backup' ? scene.message : null }
  const preview = { token: generation, mode: 'restore' as const, generation, revision: 1, items: 8, relations: 3, periods: 6, events: 8, operations: 8, sourceCalendar: calendar, warnings: [serverText().warnings.historyRecovery], backup: null, backupPath: null }
  const api: GoalloomApi = {
    getRuntime: async () => ({ electron: 'Review', node: 'Review', sqlite: 'In-memory fixture', platform: 'darwin', arch: 'arm64' }),
    getLanguage: async () => ({ language: 'zh', locale: 'zh', system: 'zh' }), setLanguage: async language => ({ language, locale: language === 'system' ? 'zh' : language, system: 'zh' }), onLanguage: noop,
    initializeParentOrder: async enabled => enabled, setParentOrder: async enabled => enabled,
    pullDevicePrefs: async () => [], reportDevicePrefs: async () => undefined, onDevicePrefs: noop, onAiRefresh: noop,
    getSnapshot: async () => structuredClone(snapshot),
    getBoardPeriods: async query => { if (!recovered && scene.surface === 'future') return fail(); return { generation, revision: 1, periods: snapshot.periods.filter(period => query.periods.some(target => target.horizon === period.horizon)), items: [], rolloverSources: {}, orderNodes: [] } },
    getReviewContext: async () => {
      if (!recovered && scene.surface === 'review' && scene.code === 'load') return fail()
      return { board: { ...snapshot, items: snapshot.items.map(item => item.id === closing.id ? closing : item), periods: snapshot.periods.map(period => period.horizon === 'week' ? closingPeriod : period) }, planning: snapshot, closing: [closing], closingParents: [], sourcePeriods: [closingPeriod], unknown: 0 }
    },
    getItem: async id => {
      if (!recovered && scene.surface === 'detail' && scene.code === 'load') return fail()
      if (!recovered && (scene.surface === 'nest' && scene.code === 'changed' || scene.surface === 'flow' && scene.code === 'unlink')) return fail()
      const item = scene.surface === 'review' && id === closing.id ? closing : snapshot.items.find(item => item.id === id) ?? snapshot.items.find(item => item.id === 'today')!
      const { note: _note, ...record } = item
      return { item: { ...record, deletedAt: scene.surface === 'toast' ? now : null, deletedBy: scene.surface === 'toast' ? 'review-delete' : null, description: '检查每一处错误信息。\n\n- 保留输入内容\n- 给出清晰的恢复入口' }, period: snapshot.periods.find(period => period.id === item.placement.periodId) ?? null,
        relations: snapshot.relations.filter(edge => edge.parentId === id || edge.childId === id).map(edge => ({ ...edge, createdAt: now, invalidatedAt: null, invalidatedBy: null, reason: null, parentTitle: snapshot.items.find(item => item.id === edge.parentId)!.title, childTitle: snapshot.items.find(item => item.id === edge.childId)!.title, parentArchived: false, childArchived: false })) }
    },
    listItems: async () => { if (!recovered && (['search', 'items', 'backlog', 'flow', 'nest'].includes(scene.surface) || scene.code === 'relation')) return fail(); return { items: snapshot.items, total: snapshot.items.length, periods: snapshot.periods } },
    getHistory: async () => { throw new Error('Review fixture has no immutable history page') },
    getPastPeriod: async () => { throw new Error('Review fixture: past period cannot be read') },
    getHistoryIndex: async () => { if (!recovered && scene.surface === 'picker') return fail(); return { periods: [] } },
    getActivity: async () => ({ events: [] }) as unknown as Awaited<ReturnType<GoalloomApi['getActivity']>>,
    getExecutionSummary: async query => facts(query.itemId),
    getActivityMonth: async () => { throw new Error('Review fixture has no activity calendar') },
    getActivityDay: async () => { throw new Error('Review fixture has no activity entries') },
    getActivityPage: async () => { throw new Error('Review fixture has no activity entries') },
    getInsightTaskContext: async query => ({ itemId: query.itemId, cutoff: query.cutoff ?? null, guidance: { value: null, quality: 'unknown', reason: null }, executionFacts: facts(query.itemId) }),
    getBatches: async () => [], getBatchItems: async () => ({ total: 0, items: [] }),
    getCounts: async () => ({ done: 0, cancelled: 0, archived: 0, trash: 0 }), getBackupSummary: async () => ({ latest: null, total: 0 }), getActivitySummary: async () => ({ total: 0, latest: null }),
    onChanged: listener => { changed.add(listener); return () => { changed.delete(listener) } },
    execute: async command => {
      if (scene.surface === 'toast') return { ok: true, result: { operationId: command.operationId, generation, changed: true, undoable: true, outcome: 'committed', itemId: 'today', label: serverText().labels.restore, warnings: [scene.message], restoreSource: null, originalOperationId: null } }
      if (scene.surface === 'review' && scene.code === 'draft') return { ok: true, result: { operationId: command.operationId, generation, changed: false, undoable: false, outcome: 'committed', itemId: null, label: '', warnings: [], restoreSource: null, originalOperationId: null } }
      if (!recovered) {
        if (scene.code === 'saveUnknown' || scene.code === 'unknown') return fail()
        return { ok: false, code: scene.surface === 'sync-review' && scene.code === 'stale' ? 'stale' : scene.code ?? 'storage', message: scene.message || serverText().storage.saveFailed }
      }
      return { ok: false, code: 'review', message: 'Review fixture: this action does not write task data.' }
    },
    getReceipt: async () => null,
    exportWorkspace: async () => fail(),
    data: async action => {
      if (action.type === 'backupStatus') { if (scene.code === 'status' && !recovered) return fail(); return { type: 'status', status: backupStatus } }
      if (scene.code === 'prepare' || scene.code === 'commit' || scene.code === 'cancel') {
        if (action.type === 'chooseImport') return { type: 'preview', preview }
        if (action.type === 'prepare' && scene.code !== 'prepare') return { type: 'preview', preview: { ...preview, backup: { id: generation, kind: 'protective', createdAt: now, localDate: null, generation, revision: 1, size: 1024, sha256: 'a'.repeat(64) }, backupPath: '/Review/protective.sqlite' } }
      }
      return fail()
    },
    smart: async action => {
      if (action.type === 'status') return { type: 'status', status: ai, test: null }
      if (action.type === 'connect') return { type: 'status', status: ai, test: { ok: false, failure: failure(), sampleMatched: null, results: { jev: { ok: false, failure: failure() }, chat: { ok: false, failure: failure() } }, enabled: [] } }
      if (action.type === 'analyze') return { type: 'analysis', reply: { status: 'failed', echo: action.request, failure: failure() } } as unknown as SmartReply
      if (action.type === 'review' && (scene.code === 'refresh' && reviewCalls++ === 0 || scene.code === 'draft' || scene.code === 'save')) return { type: 'review', reply: { status: 'ready', requestId: action.request.requestId, value: { headline: '核心体验已有进展，下一步是完成反馈闭环。', advice: '先完成报错检查，再整理下一周的安排。', flags: [] } } }
      if (action.type === 'draft' || action.type === 'review') return { type: action.type, reply: { status: 'failed', requestId: action.request.requestId, failure: failure() } }
      if (action.type === 'cancel' || action.type === 'cancelAssistance') return { type: 'cancelled' }
      if (action.type === 'prepareAssistance') {
        if (scene.code === 'prepare') return fail()
        const detail = await api.getItem('today')
        return { type: 'assistancePrepared', prepared: { ...action.request, contextId: generation, expiresAt: '2099-10-23T04:00:00Z', featureRevision: 1, provider: 'openrouter', enabled: scene.code !== 'unavailable', consented: true,
          context: { ...detail, guidance: null, parents: [], children: [], siblings: [], recentGuidance: [], facts: facts('today'), guard: { today: '2026-10-23', calendarId: calendar.id, sourceRevision: 'review', dependencies: [{ itemId: 'today', version: 1 }], guidanceRevision: 0, parentRelationCount: 1, parentRelationIds: ['r3'] }, truncatedSections: scene.code === 'too_large' ? ['description'] : [], omitted: {} } } as AssistancePrepared }
      }
      if (action.type === 'assist') return { type: 'assistance', reply: scene.code === 'stale' ? { status: 'stale', echo: action.request } : { status: 'failed', echo: action.request, failure: failure() } } as unknown as SmartReply
      return fail()
    },
    getLinkPreview: async url => ({ url, status: 'unavailable', title: null, description: null, siteName: null, favicon: null, image: null }) as unknown as Awaited<ReturnType<GoalloomApi['getLinkPreview']>>,
    openExternal: async () => false,
    update: async () => ({ version: '1.9.10', state: scene.code === 'update' ? { phase: 'failed' } : { phase: 'idle' } }) as Awaited<ReturnType<GoalloomApi['update']>>,
    billing: async () => ({ accountId: sync.accountId ?? null, environment: 'development', access: null, busy: false, error: 'billing_configuration', pending: null }),
    onBilling: noop,
    sync: async action => {
      if (scene.surface === 'sync-review' && action.type === 'reviews' && scene.code !== 'load') {
        const task = { id: 'today', title: '检查报错提示与恢复入口', description: '保留输入并提供恢复入口', dueDate: null, status: 'todo' as const, deleted: false, missing: false, archived: false, flowColors: [0], horizon: 'day' as const, periodStart: '2026-10-23', periodEnd: '2026-10-24', parents: ['打磨核心任务体验'] }
        return { status: sync, reviews: { generation, remaining: 2, review: { itemId: task.id, token: 'a'.repeat(64), local: task, current: { ...task, title: '检查报错与恢复入口，并整理反馈' }, canUseLocal: true, reason: 'changed' } } }
      }
      if (action.type !== 'status') {
        if (scene.surface === 'sync-review' || scene.code === 'request') return fail()
        sync.error = 'storage'; for (const listener of syncing) listener({ ...sync })
      }
      return { status: { ...sync } }
    },
    onSync: listener => { syncing.add(listener); return () => { syncing.delete(listener) } }, onUpdate: noop, onOpenAbout: noop, onBeforeClose: noop,
  }
  window.goalloom = api
  return { snapshot, ai, sync, recover: () => { recovered = true; for (const listener of changed) listener(null) } }
}
