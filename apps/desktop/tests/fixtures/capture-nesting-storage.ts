/**
 * [INPUT]: Production Repository, injected clock and isolated SQLite fixture.
 * [OUTPUT]: Ready/late ownership, stale guards, immutable undo/restore and import acceptance.
 * [POS]: Focus-free capture E2E extension; no user workspace or provider traffic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Repository } from '../../src/main/workspace/repository'
import type { CreationSelection } from '../../src/shared/contracts/capture'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'

export function runCaptureNesting(repository: Repository, now: string): string[] {
  const generation = repository.store.workspace().generation
  const write = (command: Record<string, unknown>, selection?: CreationSelection) => repository.execute({ operationId: randomUUID(), generation, ...command }, selection)
  let owner = write({ type: 'create', title: 'Complete Aurora 2 development', horizon: 'week' }).itemId!
  const selection = (): CreationSelection => {
    const item = repository.store.item(owner)
    return { horizon: 'week', previewPeriodId: item.placement.periodId, parents: [], nesting: { itemId: owner, title: item.title, horizon: 'week',
      periodId: item.placement.periodId, parentIds: [], version: item.version, placementVersion: item.placement.version } }
  }
  const create = (ready = false) => {
    const request = { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 0, manualRevision: 0, generation, providerRevision: 1,
      contextRevision: repository.store.workspace().revision, referenceTime: now, text: 'Implement Aurora account AI', parentHints: [] }
    const created = write({ type: 'createPlan', items: [{ draftId: 'capture', title: request.text, horizon: 'later', previewPeriodId: null }],
      smartCapture: { request, allowPlacement: true, allowParents: true } }, ready ? selection() : undefined)
    return { request, created }
  }
  const complete = ({ request, created }: ReturnType<typeof create>, value = selection()) => write({ type: 'completeCreation', creationOperationId: created.operationId,
    requestId: request.requestId, itemId: created.itemId, expectedVersion: created.capture!.itemVersion, expectedPlacementVersion: created.capture!.placementVersion, selection: value })
  const valid = () => validateImport(exportDataset(repository.store, now), now)
  for (const ready of [true, false]) {
    const capture = create(ready), immutable = JSON.stringify(repository.store.operation(capture.created.operationId))
    if (!ready) assert(complete(capture).changed)
    const id = capture.created.itemId!, item = repository.store.item(id)
    assert.equal(item.placement.nestingParentId, owner)
    assert.equal(item.placement.horizon, 'week')
    assert.equal(JSON.stringify(repository.store.operation(capture.created.operationId)), immutable)
    valid()
    write({ type: 'edit', itemId: id, expectedVersion: item.version, title: 'Edited child text', description: 'Keep this note', dueDate: null })
    const undo = write({ type: 'undo', originalOperationId: capture.created.operationId })
    assert.equal(undo.outcome, 'committed')
    assert(repository.store.item(id).deletedAt)
    valid()
    write({ type: 'restoreItem', itemId: id, expectedVersion: repository.store.item(id).version, deletionSource: undo.operationId })
    assert.equal(repository.store.item(id).placement.nestingParentId, owner)
    assert.equal(repository.store.item(id).title, 'Edited child text')
    assert.equal(repository.store.item(id).description, 'Keep this note')
    valid()
  }
  for (const change of ['rename', 'move', 'archive', 'done', 'nest', 'delete'] as const) {
    owner = write({ type: 'create', title: 'Complete Aurora 2 development', horizon: 'week' }).itemId!
    const capture = create(), stale = selection(), item = repository.store.item(owner)
    let mutation
    if (change === 'rename') mutation = write({ type: 'edit', itemId: owner, expectedVersion: item.version, title: 'Renamed Aurora owner', description: '', dueDate: null })
    if (change === 'move') mutation = write({ type: 'move', itemId: owner, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
    if (change === 'archive') mutation = write({ type: 'archive', itemId: owner, expectedVersion: item.version, archived: true })
    if (change === 'done') mutation = write({ type: 'status', itemId: owner, expectedVersion: item.version, status: 'done' })
    if (change === 'delete') mutation = write({ type: 'delete', itemId: owner, expectedVersion: item.version })
    if (change === 'nest') {
      // A separate leaf owner allows the third-level guard without moving existing children.
      stale.nesting!.itemId = write({ type: 'create', title: item.title, horizon: 'week', nesting: { parentId: owner,
        expectedParentVersion: item.version, expectedParentPlacementVersion: item.placement.version } }).itemId!
      const child = repository.store.item(stale.nesting!.itemId)
      stale.nesting!.version = child.version; stale.nesting!.placementVersion = child.placement.version
    }
    complete(capture, stale)
    assert.equal(repository.store.item(capture.created.itemId!).placement.nestingParentId ?? null, null, change)
    valid()
    assert(mutation || change === 'nest')
  }
  return ['Ready and late global capture nest atomically; one undo and scoped restore retain edited text and valid history',
    'Renamed, moved, archived, completed, deleted or already nested owners cannot receive stale automatic children']
}
