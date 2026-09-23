/**
 * [INPUT]: 不可信 schema v1/v2 数据集与显式导入观察时刻；v1 条目没有流程颜色。
 * [OUTPUT]: 严格实体/日期/引用/DAG/流程颜色/效果/业务事件链校验后的 Dataset。
 * [POS]: 纯导入入口，JSON 与 SQLite 恢复共用；不执行文件或数据库操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { datasetSchema, type Dataset } from '../shared/contracts/transfer'
import type { BusinessState, Effect, ItemEvent } from '../shared/contracts/effects'
import type { ItemHorizon, PlanningPeriod, Relation } from '../shared/contracts/entities'
import { compareInstants, currentPeriod, parseDate, workspaceDate } from './calendar'
import { validateDag } from './relations'
import { matchesStatus } from './status'

function requireValid(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function unique<T>(rows: T[], identity: (row: T) => string | number, label: string): Map<string | number, T> {
  const map = new Map(rows.map(row => [identity(row), row]))
  requireValid(map.size === rows.length, `${label}含重复身份`)
  return map
}
function sameBusiness(a: BusinessState, b: BusinessState): boolean {
  return matchesStatus(a, b) && a.horizon === b.horizon && a.periodId === b.periodId && a.archivedAt === b.archivedAt && a.deletedAt === b.deletedAt && a.deletedBy === b.deletedBy
}
function validState(state: Pick<BusinessState, 'status' | 'completedAt' | 'cancelledAt' | 'deletedAt' | 'deletedBy'>, unknownTime = false): void {
  requireValid((state.deletedAt === null) === (state.deletedBy === null), '删除来源或日期不完整')
  const valid = state.status === 'todo' ? state.completedAt === null && state.cancelledAt === null : state.status === 'done' ? state.cancelledAt === null && (unknownTime || state.completedAt !== null) : state.completedAt === null && (unknownTime || state.cancelledAt !== null)
  requireValid(valid, '状态与完成/取消时间不一致')
}
function placement(horizon: ItemHorizon, periodId: string | null, periods: Map<string | number, PlanningPeriod>): void {
  requireValid(horizon === 'later' ? periodId === null : periodId !== null && periods.get(periodId)?.horizon === horizon, '位置引用或尺度不匹配')
}
function edgeIdentity(a: Relation, b: Relation): boolean { return a.id === b.id && a.parentId === b.parentId && a.childId === b.childId && a.createdAt === b.createdAt }

export function validateImport(input: unknown, observedAt: string): Dataset {
  const data = datasetSchema.parse(input)
  // --- 无历史旧数据缺策略时，只从恢复当天的来源周期启用默认策略。 ---
  if (data.historyMode === 'baseline' && data.workspace.calendar && data.policies.length === 0) {
    for (const horizon of ['cycle', 'month', 'week', 'day'] as const) {
      const period = currentPeriod(data.workspace.calendar, horizon, observedAt)
      if (!data.periods.some(row => row.id === period.id)) data.periods.push(period)
      data.policies.push({ horizon, mode: horizon === 'day' ? 'auto' : 'manual', version: 1, effectiveFromPeriodId: period.id })
    }
  }
  const items = unique(data.items, row => row.id, '条目'), places = unique(data.placements, row => row.itemId, '位置')
  const periods = unique(data.periods, row => row.id, '周期'), edges = unique(data.relations, row => row.id, '关联')
  const operations = unique(data.operations, row => row.id, '操作'), policies = unique(data.policies, row => row.horizon, '策略')
  const eventsByOperation = new Map<string, ItemEvent[]>()
  for (const event of [...data.events].sort((a, b) => a.seq - b.seq)) {
    const group = eventsByOperation.get(event.operationId) ?? []
    group.push(event); eventsByOperation.set(event.operationId, group)
  }
  unique(data.events, row => row.id, '事件'); unique(data.events, row => row.seq, '事件序列')
  unique(data.events, row => `${row.operationId}:${row.eventIndex}`, '操作内事件')
  unique(data.undoEffects, row => `${row.originalId}:${row.effectIndex}`, '撤销效果')
  const calendar = data.workspace.calendar
  requireValid((calendar === null) === (data.workspace.setupConfirmedAt === null), '首次配置标记不完整')
  requireValid(calendar || (!data.items.length && !data.periods.length && !data.policies.length && !data.events.length), '未确认配置的源工作区包含业务数据')
  if (calendar) requireValid(calendar.cycleAnchor <= workspaceDate(calendar.timezone, observedAt), '源日历起点晚于今天，无法恢复')
  for (const period of data.periods) {
    requireValid(calendar, '周期缺少日历')
    const expected = currentPeriod(calendar, period.horizon, parseDate(period.startDate).toZonedDateTime(calendar.timezone).toInstant().toString())
    requireValid(JSON.stringify(period) === JSON.stringify(expected), '周期身份或固定日期边界与源日历不符')
  }
  if (calendar) requireValid(policies.size === 4, '源工作区缺少顺延策略')
  for (const policy of data.policies) requireValid(periods.get(policy.effectiveFromPeriodId)?.horizon === policy.horizon && (policy.horizon !== 'cycle' || policy.mode === 'manual'), '策略生效周期或3个月策略无效')
  requireValid(items.size === places.size, '每个条目必须恰有一个位置')
  const baselines = new Set(data.events.filter(event => event.type === 'baseline').map(event => event.itemId))
  for (const item of data.items) {
    const p = places.get(item.id); requireValid(p, '条目缺少位置')
    placement(p.horizon, p.periodId, periods)
    validState(item, data.historyMode === 'baseline' || baselines.has(item.id))
    validateHold(p.horizon, p.periodId, p.holdPeriodId, periods)
  }
  for (const p of data.placements) requireValid(items.has(p.itemId), '位置悬空')
  validateDag(new Set(data.items.map(item => item.id)), data.relations, new Set(data.items.filter(item => item.deletedAt).map(item => item.id)))
  const children = new Set(data.relations.filter(edge => edge.invalidatedAt === null).map(edge => edge.childId))
  const colours = data.items.filter(item => item.flowColor !== null && item.deletedAt === null).map(item => item.flowColor)
  requireValid(new Set(colours).size === colours.length, '流程颜色重复')
  requireValid(data.items.every(item => item.flowColor === null || !children.has(item.id)), '流程根不能有上级')
  for (const edge of data.relations) requireValid((edge.invalidatedAt === null) === (edge.invalidatedBy === null) && (edge.invalidatedAt === null) === (edge.reason === null), '关联失效标记不完整')
  if (data.historyMode === 'baseline') {
    requireValid(!data.events.length && !data.operations.length && !data.undoEffects.length, '无历史模式不可混入部分事件或操作')
    return data
  }
  for (const operation of data.operations) {
    requireValid(operation.result.operationId === operation.id && operation.result.generation === operation.generation, '操作回执身份不一致')
    requireValid(!operation.result.itemId || items.has(operation.result.itemId), '操作指向不存在条目')
    requireValid(operation.result.undoable === (operation.source === 'user' && operation.effects.length > 0), '操作撤销标记与效果不一致')
    requireValid(operation.result.outcome !== 'conflict_skipped' || (!operation.result.changed && !operation.effects.length && operation.kind === 'undo'), '冲突回执包含业务变化')
    validateKind(operation)
    for (const effect of operation.effects) validateEffect(effect, items, periods, edges)
  }
  for (const marker of data.undoEffects) {
    const original = operations.get(marker.originalId), inverse = operations.get(marker.undoId)
    requireValid(original?.effects[marker.effectIndex] && inverse && inverse.result.changed && inverse.result.originalOperationId === original.id && ['undo', 'undoBatch'].includes(inverse.kind), '撤销标记悬空或回执不一致')
    requireValid(original.id !== inverse.id, '操作不能撤销自己')
  }
  const chains = new Map<string, ItemEvent[]>()
  for (const event of [...data.events].sort((a, b) => a.seq - b.seq)) {
    const operation = operations.get(event.operationId)
    requireValid(items.has(event.itemId) && operation, '事件引用悬空')
    requireValid(compareInstants(operation.at, event.at) === 0, '事件与操作实际时间不一致')
    const chain = chains.get(event.itemId) ?? []
    const previous = chain.at(-1)
    requireValid(previous ? event.before && sameBusiness(previous.after, event.before) && event.before.version >= previous.after.version : event.before === null && ['created', 'baseline'].includes(event.type), '业务事件链不连续或缺少明确起点')
    for (const state of [event.before, event.after].filter(state => state !== null)) {
      placement(state.horizon, state.periodId, periods); validState(state, baselines.has(event.itemId)); validateHold(state.horizon, state.periodId, state.holdPeriodId, periods)
    }
    if (event.before) requireValid(event.after.version > event.before.version, '事件版本没有递增')
    if (previous && compareInstants(previous.at, event.at) > 0) requireValid(data.workspace.clockAnomaly || data.operations.some(operation => operation.kind === 'confirmClock'), '历史时钟回拨缺少异常标记或复核记录')
    validateEvent(event, operation, data, periods)
    chain.push(event); chains.set(event.itemId, chain)
  }
  for (const item of data.items) {
    const last = chains.get(item.id)?.at(-1), p = places.get(item.id)!
    const current: BusinessState = { ...item, horizon: p.horizon, periodId: p.periodId, sortKey: p.sortKey, holdPeriodId: p.holdPeriodId }
    requireValid(last && sameBusiness(last.after, current) && item.version >= last.after.version, '事件末尾与当前表不一致')
  }
  for (const operation of data.operations) {
    const events = eventsByOperation.get(operation.id) ?? []
    requireValid(events.every((event, index) => event.eventIndex === index), '操作内事件序号不连续')
    for (const effect of operation.effects) {
      const needsEvent = !['relations'].includes(effect.kind) && !(effect.kind === 'position' && effect.before.periodId === effect.after.periodId && effect.before.horizon === effect.after.horizon)
      if (needsEvent) {
        const event = events.find(event => event.itemId === effect.itemId)
        requireValid(event, '业务效果缺少原子事件')
        validateOwnedFields(effect, event)
      }
      if (effect.kind === 'relations' || effect.kind === 'visibility') for (const delta of effect.edges) {
        if (['delete', 'unlink'].includes(operation.kind)) requireValid(delta.after.invalidatedBy === operation.id && delta.after.invalidatedAt === operation.at && delta.after.reason === (operation.kind === 'delete' ? 'delete' : 'unlink'), '关系失效来源与操作不一致')
        if (['link', 'restoreItem'].includes(operation.kind)) requireValid(delta.after.invalidatedAt === null && delta.after.invalidatedBy === null && delta.after.reason === null, '关联/还原效果必须产生有效边')
      }
    }
  }
  return data
}
function validateHold(horizon: ItemHorizon, periodId: string | null, hold: string | null, periods: Map<string | number, PlanningPeriod>): void {
  if (!hold) return
  requireValid(periodId && periods.get(hold)?.horizon === horizon && compareInstants(periods.get(periodId)!.endAt, periods.get(hold)!.startAt) <= 0, 'hold 必须指向来源已结束后的同尺度周期')
}
function validateEffect(effect: Effect, items: Map<string | number, unknown>, periods: Map<string | number, PlanningPeriod>, edges: Map<string | number, Relation>): void {
  requireValid(items.has(effect.itemId), '效果条目悬空')
  if (effect.kind === 'create') { placement(effect.horizon, effect.periodId, periods); requireValid(effect.status.status === 'todo' && effect.initialRelations.every(id => { const edge = edges.get(id); return edge && (edge.parentId === effect.itemId || edge.childId === effect.itemId) }), '创建效果的状态或初始依赖不合法') }
  if (effect.kind === 'position') for (const p of [effect.before, effect.after]) {
    placement(p.horizon, p.periodId, periods)
    requireValid([p.previousId, p.nextId].every(id => id === null || (id !== effect.itemId && items.has(id))) && (!p.previousId || p.previousId !== p.nextId), '排序依赖悬空或重复')
  }
  if (effect.kind === 'relations' || effect.kind === 'visibility') {
    unique(effect.edges, edge => edge.after.id, '关系差量')
    for (const delta of effect.edges) requireValid(edges.has(delta.after.id) && edgeIdentity(edges.get(delta.after.id)!, delta.after) && (!delta.before || edgeIdentity(delta.before, delta.after)), '关系效果身份不一致')
  }
}
function validateKind(operation: Dataset['operations'][number]): void {
  const allowed: Record<string, Effect['kind'][]> = { create: ['create'], edit: [], flowColor: [], move: ['position'], link: ['relations'], status: ['status'], archive: ['archive'], delete: ['visibility'], restoreItem: ['visibility'], unlink: ['relations'], undo: [], undoBatch: [], arrangeBacklog: ['position'], rollover: ['position'], baseline: [], confirmSetup: [], preferences: [], policy: [], confirmClock: [], confirmRollover: [], backupPreferences: [] }
  requireValid(allowed[operation.kind] && operation.effects.every(effect => allowed[operation.kind]!.includes(effect.kind)), '操作类型或效果白名单不符')
  requireValid(operation.source === (['rollover', 'baseline'].includes(operation.kind) ? 'system' : 'user'), '操作来源不符')
  const inverse = ['undo', 'undoBatch'].includes(operation.kind)
  requireValid(inverse === (operation.result.originalOperationId !== null), '逆操作引用不符')
  requireValid(operation.result.changed || !operation.effects.length, '无变化操作不能包含效果')
  if (operation.result.changed && allowed[operation.kind]!.length) requireValid(operation.effects.length > 0, '可撤销业务操作缺少效果')
  if (!['rollover', 'arrangeBacklog'].includes(operation.kind)) requireValid(operation.effects.length <= 1, '普通用户操作包含多余效果')
}
function validateEvent(event: ItemEvent, operation: Dataset['operations'][number], data: Dataset, periods: Map<string | number, PlanningPeriod>): void {
  const a = event.before, b = event.after
  const types: Record<string, string[]> = { created: ['create'], baseline: ['baseline'], moved: ['move', 'arrangeBacklog'], rolled_over: ['move', 'arrangeBacklog', 'rollover'], status_changed: ['status'], archived: ['archive'], unarchived: ['archive'], deleted: ['delete'], item_restored: ['restoreItem'], undo: ['undo', 'undoBatch'] }
  requireValid(types[event.type]?.includes(operation.kind), '事件类型与操作不符')
  if (event.type === 'baseline') { requireValid(!a && !event.undoOf, 'baseline 必须是明确起点'); return }
  if (event.type === 'created') { requireValid(!a && b.status === 'todo' && !b.archivedAt && !b.deletedAt && !b.holdPeriodId, '创建事件初始状态无效'); return }
  requireValid(a, '变化事件缺少前状态')
  if (event.type === 'undo') {
    const original = data.operations.find(row => row.id === event.undoOf)
    requireValid(original && operation.result.originalOperationId === original.id, '反向事件引用无效')
    const effects = original.effects.filter(effect => effect.itemId === event.itemId)
    requireValid(effects.length === 1, '反向事件缺少唯一原效果')
    validateInverse(event, effects[0]!, operation.id)
    requireValid(data.undoEffects.some(marker => marker.originalId === original.id && marker.undoId === operation.id && original.effects[marker.effectIndex]?.itemId === event.itemId), '反向事件缺少已逆转标记')
    return
  }
  requireValid(!event.undoOf, '普通事件不能带撤销引用')
  const expected = { ...a }
  if (['moved', 'rolled_over'].includes(event.type)) {
    requireValid(a.horizon !== b.horizon || a.periodId !== b.periodId, '同期排序不应制造移动事件')
    if (event.type === 'rolled_over') requireValid(a.periodId && b.periodId && a.horizon === b.horizon && compareInstants(periods.get(a.periodId)!.startAt, periods.get(b.periodId)!.startAt) < 0, '顺延方向不合法')
    Object.assign(expected, { horizon: b.horizon, periodId: b.periodId })
    requireValid(b.holdPeriodId === null, '手动/自动移动必须清除 hold')
  }
  if (event.type === 'status_changed') {
    requireValid(a.status !== b.status && (b.status === 'todo' || compareInstants((b.status === 'done' ? b.completedAt : b.cancelledAt)!, event.at) === 0), '状态变化没有实际时间')
    Object.assign(expected, { status: b.status, completedAt: b.completedAt, cancelledAt: b.cancelledAt })
  }
  if (event.type === 'archived' || event.type === 'unarchived') { requireValid(event.type === 'archived' ? a.archivedAt === null && b.archivedAt === event.at : a.archivedAt !== null && b.archivedAt === null, '归档事件无效'); expected.archivedAt = b.archivedAt }
  if (event.type === 'deleted' || event.type === 'item_restored') {
    requireValid(event.type === 'deleted' ? a.deletedAt === null && b.deletedAt === event.at && b.deletedBy === operation.id : a.deletedAt !== null && b.deletedAt === null && b.deletedBy === null, '删除/还原事件无效')
    Object.assign(expected, { deletedAt: b.deletedAt, deletedBy: b.deletedBy })
  }
  requireValid(sameBusiness(expected, b), '事件修改了不属于该操作的业务字段')
}
function validateInverse(event: ItemEvent, effect: Effect, inverseId: string): void {
  const expected = { ...event.before! }
  if (effect.kind === 'status') requireValid(matchesStatus(expected, effect.after), '状态逆操作前值不匹配原效果')
  if (effect.kind === 'position') requireValid(expected.horizon === effect.after.horizon && expected.periodId === effect.after.periodId, '位置逆操作前值不匹配原效果')
  if (effect.kind === 'archive') requireValid(expected.archivedAt === effect.after, '归档逆操作前值不匹配原效果')
  if (effect.kind === 'visibility') requireValid(expected.deletedAt === effect.after.deletedAt && expected.deletedBy === effect.after.deletedBy, '可见性逆操作前值不匹配原效果')
  if (effect.kind === 'create') requireValid(matchesStatus(expected, effect.status) && expected.horizon === effect.horizon && expected.periodId === effect.periodId && !expected.archivedAt && !expected.deletedAt, '撤销创建前状态与初始效果不匹配')
  switch (effect.kind) {
    case 'create': Object.assign(expected, { deletedAt: event.at, deletedBy: inverseId }); break
    case 'status': Object.assign(expected, effect.before); break
    case 'position': Object.assign(expected, { horizon: effect.before.horizon, periodId: effect.before.periodId }); break
    case 'archive': expected.archivedAt = effect.before; break
    case 'visibility': Object.assign(expected, effect.before); break
    case 'relations': throw new Error('纯关系逆转不应制造业务事件')
  }
  requireValid(sameBusiness(expected, event.after), '逆操作覆盖了无关字段或没有还原原效果')
}
function validateOwnedFields(effect: Effect, event: ItemEvent): void {
  const a = event.before, b = event.after
  if (effect.kind === 'create') requireValid(!a && matchesStatus(effect.status, b) && effect.horizon === b.horizon && effect.periodId === b.periodId, '创建回执与事件不一致')
  if (effect.kind === 'status') requireValid(a && matchesStatus(effect.before, a) && matchesStatus(effect.after, b), '状态回执与事件不一致')
  if (effect.kind === 'position') requireValid(a && effect.before.horizon === a.horizon && effect.before.periodId === a.periodId && effect.after.horizon === b.horizon && effect.after.periodId === b.periodId, '位置回执与事件不一致')
  if (effect.kind === 'archive') requireValid(a && effect.before === a.archivedAt && effect.after === b.archivedAt, '归档回执与事件不一致')
  if (effect.kind === 'visibility') requireValid(a && effect.before.deletedAt === a.deletedAt && effect.before.deletedBy === a.deletedBy && effect.after.deletedAt === b.deletedAt && effect.after.deletedBy === b.deletedBy, '可见性回执与事件不一致')
}
