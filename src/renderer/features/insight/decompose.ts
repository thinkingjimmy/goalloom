/**
 * [INPUT]: Snapshot, flows, insight readiness, guarded submission, a composer-seed opener and one parent (gap) or month parent with skipped day children (bridge).
 * [OUTPUT]: decompose — drafts one title and creates it (create / insertBetween into the current or next period), or opens the prefilled composer when asked (manual) or when no model/draft is available.
 * [POS]: features/insight 的「拆下一步」唯一写入路径；断点 ＋ 与右键菜单共用，写入仍走权威命令。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { DraftTask } from '../../../shared/contracts/smart-input'
import { insightMessages as t } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { requestDraft } from '../../state/insight'
import type { ComposerSeed } from '../composer/Seeded'
import { boardDigest, draftTarget, periodText, type ChildHorizon } from './signals'

export type Seed = Omit<ComposerSeed, 'key'>
export interface DecomposeContext { snapshot: Snapshot; flows: Flows; ready: boolean; submit: (action: Action) => Promise<unknown>; seed: (seed: Seed) => void }
export interface DecomposeTarget { parent: ItemSummary; target: ChildHorizon; children: ItemSummary[]; manual: boolean; onCreated?: (title: string, period: PlanningPeriod, next: boolean) => void }

export async function decompose({ snapshot, flows, ready, submit, seed }: DecomposeContext, { parent, target, children, manual, onCreated }: DecomposeTarget): Promise<void> {
  const bridge = children.length > 0
  const { period, next } = bridge ? { period: snapshot.periods.find(value => value.horizon === 'week')!, next: false } : draftTarget(snapshot, target)
  const created = (title: string) => onCreated?.(title, period, next)
  const base: Seed = { mode: bridge ? 'bridge' : 'next', horizon: target, period, next, parent, children, parents: [], draft: false, note: null, onCreated: created }
  if (manual || !ready) { seed(base); return }
  const siblings = snapshot.relations.filter(edge => edge.parentId === parent.id).map(edge => snapshot.items.find(item => item.id === edge.childId)?.title).filter((value): value is string => !!value).slice(0, 20)
  const task: DraftTask = { id: parent.id, kind: bridge ? 'bridge' : 'next', parent: parent.title, goal: flows.of(parent.id).find(value => value.id !== parent.id)?.title ?? null,
    target: periodText(period, next), targetHorizon: target, siblings, children: children.map(child => child.title) }
  const result = await requestDraft({ generation: snapshot.workspace.generation, board: boardDigest(snapshot, flows), tasks: [task] })
  if (!result.ok) { seed({ ...base, note: result.failure ? t.seedDraftFailed(result.failure.message) : null }); return }
  const title = result.value[0]!.title
  const where = next ? { period: { kind: 'date' as const, startDate: period.startDate } } : {}
  const action: Action = bridge
    ? { type: 'insertBetween', title, horizon: 'week', ...where, parentId: parent.id, expectedParentVersion: parent.version, children: children.map(child => ({ itemId: child.id, expectedVersion: child.version })) }
    : { type: 'create', title, description: '', dueDate: null, horizon: target, ...where, parentId: parent.id, expectedParentVersion: parent.version, flowColor: null }
  if (await submit(action)) created(title)
}
