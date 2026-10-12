/**
 * [INPUT]: Snapshot, flows, insight readiness, guarded submission, a composer-seed opener and a parent needing a child in a shorter horizon.
 * [OUTPUT]: decompose — drafts one title and creates a child in the current or next period, or opens the prefilled composer when asked (manual) or when no model/draft is available.
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
export interface DecomposeTarget { parent: ItemSummary; target: ChildHorizon; manual: boolean; onCreated?: (title: string, period: PlanningPeriod, next: boolean) => void }

export async function decompose({ snapshot, flows, ready, submit, seed }: DecomposeContext, { parent, target, manual, onCreated }: DecomposeTarget): Promise<void> {
  const { period, next } = draftTarget(snapshot, target, parent)
  const created = (title: string) => onCreated?.(title, period, next)
  const base: Seed = { mode: 'next', horizon: target, period, next, parent, parents: [], draft: false, note: null, onCreated: created }
  if (manual || !ready) { seed(base); return }
  const siblings = snapshot.relations.filter(edge => edge.parentId === parent.id).map(edge => snapshot.items.find(item => item.id === edge.childId)?.title).filter((value): value is string => !!value).slice(0, 20)
  const task: DraftTask = { id: parent.id, parent: parent.title, goal: flows.of(parent.id).find(value => value.id !== parent.id)?.title ?? null,
    target: periodText(period, next, snapshot.workspace.calendar!), targetHorizon: target, siblings }
  const result = await requestDraft({ generation: snapshot.workspace.generation, board: boardDigest(snapshot, flows), tasks: [task] })
  if (!result.ok) { seed({ ...base, note: result.failure ? t.seedDraftFailed(result.failure.message) : null }); return }
  const title = result.value[0]!.title
  const where = { period: { kind: 'date' as const, startDate: period.startDate } }
  const action: Action = { type: 'create', title, description: '', dueDate: null, horizon: target, ...where, parentId: parent.id, expectedParentVersion: parent.version, flowColor: null }
  if (await submit(action)) created(title)
}
