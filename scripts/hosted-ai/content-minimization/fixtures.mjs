/**
 * [INPUT]: Cryptographic random request/session identities and fixed public synthetic tasks.
 * [OUTPUT]: Four bounded capability fixtures; never persisted as acceptance output.
 * [POS]: Shared live/controlled acceptance data, independent of user workspaces.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
const at = '2026-10-23T00:00:00.000Z', generation = 'synthetic-generation', itemId = 'synthetic-item'
const board = { today: '2026-10-23', periods: {}, goals: [], unlinked: { half: [], cycle: [], month: [], week: [], day: [] } }
const prefs = { about: '', stepSize: 'smallest', stepNotes: '', tone: 'direct', focus: [] }
const unknown = () => ({ value: null, quality: 'unknown', reason: 'Synthetic fixture; no activity history' })
const current = { quality: 'unknown', status: 'todo', horizon: 'later', periodId: null, dueDate: null, archived: false, deleted: false }
const facts = { calculationVersion: 1, itemId, generation, asOf: at, timezone: 'UTC', sourceRevision: 'synthetic', coverage: { quality: 'unknown', earliestKnownAt: null, reasons: [] }, current,
  createdAt: unknown(), createdAgeDays: unknown(), currentEpisode: unknown(), currentPlacement: unknown(), carryovers: { currentEpisode: unknown(), lifetime: unknown() },
  scheduleChanges: { advanceReschedule: unknown(), otherPlacementChanges: unknown() }, placementDurations: Object.fromEntries(['year', 'half', 'cycle', 'month', 'week', 'day'].map(key => [key, unknown()])),
  deadlineNow: unknown(), pressure: { level: unknown(), windows: { day: unknown(), week: unknown() }, suppression: unknown() }, evidence: [] }
export const description = '- [x] Create the outline\n- [ ] Write the introduction\nReference: https://example.com/guide'
export const inputs = {
  evaluate: { state: { text: '明天写三句话的指南开头' }, questions: { task: { type: 'boolean', instructions: 'Does this text describe an actionable task?', criteria: { true: 'Actionable task', false: 'Not a task' } } } },
  draft: { requestId: randomUUID(), generation, board, prefs, tasks: [{ id: itemId, parent: 'Write a short guide', goal: null, target: 'Today', targetHorizon: 'day', siblings: [] }] },
  review: { requestId: randomUUID(), generation, scope: 'week', board, prefs, signals: [] },
  assistance: { context: { item: { id: itemId, title: 'Write a short guide', description, dueDate: null, status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null, createdAt: at, updatedAt: at, version: 1, flowColor: null, placement: { itemId, horizon: 'later', periodId: null, sortKey: 1, version: 1, holdPeriodId: null } },
    guidance: null, period: null, parents: [], children: [], siblings: [], recentGuidance: [], facts,
    guard: { today: board.today, calendarId: 'synthetic-calendar', sourceRevision: 'synthetic', dependencies: [{ itemId, version: 1 }], guidanceRevision: 0, parentRelationCount: 0, parentRelationIds: [] }, truncatedSections: [], omitted: {} },
    request: { requestId: randomUUID(), sessionId: randomUUID(), itemId, generation, inputRevision: 0, manualRevision: 0, featureRevision: 0, contextId: randomUUID(), locale: 'en', turn: 1, mode: 'rewrite', prefs, text: 'I need one small starting action. Keep the completed work and reference.', answer: null, adjustment: null }, conversation: [] },
}
