/**
 * [INPUT]: Deterministic calendar rules and public read-model types.
 * [OUTPUT]: Synthetic workspace, tasks, AI and sync states for the review surface.
 * [POS]: In-memory fixtures; no user profile, account or workspace files are read.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod } from '../src/domain/calendar'
import { periodHorizons } from '../src/shared/contracts/values'
import type { Snapshot } from '../src/shared/contracts/queries'
import type { ItemHorizon, ItemSummary } from '../src/shared/contracts/entities'
import type { SmartStatus } from '../src/shared/contracts/smart-input'
import type { SyncStatus } from '../src/shared/contracts/sync'
import type { ExecutionFacts } from '../src/shared/contracts/execution'
export const now = '2026-10-23T04:00:00.000Z'
export const generation = '98e1ac26-9394-444a-89a3-9b35a24af903'
export const calendar = { id: 'review-calendar', mode: 'natural' as const, timezone: 'Asia/Singapore', weekStart: 1, cycleAnchor: '2026-01-01' }
export function fixture(): Snapshot {
  const periods = periodHorizons.map(horizon => currentPeriod(calendar, horizon, now))
  const task = (id: string, title: string, horizon: ItemHorizon, sortKey: number, flowColor: number | null = null): ItemSummary => ({
    id, title, note: null, dueDate: null, status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
    createdAt: now, updatedAt: now, version: 1, flowColor,
    placement: { itemId: id, horizon, periodId: periods.find(period => period.horizon === horizon)?.id ?? null, sortKey, version: 1, holdPeriodId: null, nestingParentId: null },
  })
  const items = [task('goal', '让想法变成可以使用的产品', 'cycle', 1, 0), task('month-goal', '完成产品的第一个可用版本', 'month', 1), task('week-goal', '打磨核心任务体验', 'week', 1), task('today', '检查报错提示与恢复入口', 'day', 1), task('today-two', '整理本周收到的反馈', 'day', 2), task('month-two', '与 5 位使用者交流', 'month', 2), task('week-two', '验证新用户的首次体验', 'week', 2), task('later-one', '收集下一版的灵感', 'later', 1)]
  return { workspace: { generation, calendar, setupConfirmedAt: now, pausedAfterRestore: false, revision: 1, lastObservedAt: now, clockAnomaly: false, theme: 'light', style: 'paper', checkStyle: 'outline', backupEnabled: true, backupRetention: 10 }, periods, items,
    relations: [{ id: 'r1', parentId: 'goal', childId: 'month-goal' }, { id: 'r2', parentId: 'month-goal', childId: 'week-goal' }, { id: 'r3', parentId: 'week-goal', childId: 'today' }],
    flows: [{ id: 'goal', title: items[0]!.title, flowColor: 0, archived: false }],
    policies: periods.map(period => ({ horizon: period.horizon, mode: 'manual', version: 1, effectiveFromPeriodId: period.id })),
    backlog: { week: 3 }, observedAt: now, maintenance: false, backupError: null, rolloverSources: {},
    orderNodes: items.map(item => ({ id: item.id, ...item.placement, periodStart: periods.find(period => period.id === item.placement.periodId)?.startDate ?? null, periodEnd: periods.find(period => period.id === item.placement.periodId)?.endAt ?? null })),
  }
}
export function smartStatus(): SmartStatus {
  const provider = { credential: 'saved' as const, keyHint: '…review', consentedAt: now, verifiedAt: now, capabilities: { jev: now, chat: now }, lastFailure: null, cooldownUntil: null, assistanceConsent: { version: 1 as const, at: now } }
  return { providers: { openrouter: { ...provider }, 'vercel-gateway': { ...provider, credential: 'missing', consentedAt: null }, hosted: { ...provider, credential: 'missing', consentedAt: null } }, sessionRevision: 1, hostedAccountId: null, hostedEligible: null, features: { smart: { provider: 'openrouter', revision: 1, enabled: true, paused: false }, insight: { provider: 'openrouter', revision: 1, enabled: true, paused: false } }, dismissed: ['globalEntry', 'smartSetup'], unsignedBuild: false }
}
export const syncStatus = (): SyncStatus => ({ phase: 'ready', accountId: generation, email: 'review@example.test', pending: 0, conflicts: 0, paused: null, lastSyncedAt: now, error: null, localItems: 8, offline: false, syncing: false, realtimeConnected: true })
export function facts(itemId: string): ExecutionFacts {
  const unknown = () => ({ value: null, quality: 'unknown' as const, reason: 'Synthetic review workspace has no execution history' })
  return { calculationVersion: 1, itemId, generation, asOf: now, timezone: calendar.timezone, sourceRevision: 'review-1', coverage: { quality: 'unknown', earliestKnownAt: null, reasons: [] },
    current: { quality: 'complete', status: 'todo', horizon: 'day', periodId: null, dueDate: null, archived: false, deleted: false },
    createdAt: unknown(), createdAgeDays: unknown(), currentEpisode: unknown(), currentPlacement: unknown(), carryovers: { currentEpisode: unknown(), lifetime: unknown() }, scheduleChanges: { advanceReschedule: unknown(), otherPlacementChanges: unknown() },
    placementDurations: Object.fromEntries(periodHorizons.map(horizon => [horizon, unknown()])) as ExecutionFacts['placementDurations'], deadlineNow: unknown(), pressure: { level: unknown(), windows: { day: unknown(), week: unknown() }, suppression: unknown() }, evidence: [] }
}
