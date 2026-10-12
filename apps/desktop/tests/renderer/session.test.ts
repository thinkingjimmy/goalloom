import { expect, it } from 'vitest'
import { UndoSession } from '../../src/renderer/state/session'
import type { CommandResult } from '../../src/shared/contracts/commands'
const result = (operationId: string, extra: Partial<CommandResult> = {}): CommandResult => ({ operationId, generation: 'workspace', changed: true, undoable: true, outcome: 'committed', itemId: 'item', label: '创建', warnings: [], restoreSource: null, originalOperationId: null, ...extra })
it('只收已提交有变化的用户效果，幂等回执不重复入栈或反馈', () => {
  const session = new UndoSession(); session.reset('workspace')
  expect(session.accept(result('create'))).toBe(true)
  expect(session.accept(result('create'))).toBe(false)
  session.accept(result('edit', { undoable: false }))
  session.accept(result('noop', { changed: false }))
  expect(session.entries.map(entry => entry.operationId)).toEqual(['create'])
})
it('非栈顶撤销仅移出对应项；冲突一次只移出当前项且不递归撤销', () => {
  const session = new UndoSession(); session.reset('workspace')
  for (const id of ['create', 'move', 'done']) session.accept(result(id))
  session.accept(result('undo-move', { originalOperationId: 'move', undoable: false }))
  expect(session.entries.map(entry => entry.operationId)).toEqual(['create', 'done'])
  session.accept(result('undo-done', { originalOperationId: 'done', undoable: false, outcome: 'conflict_skipped', changed: false }))
  expect(session.entries.map(entry => entry.operationId)).toEqual(['create'])
})
it('同一工作区重复 reset 保留成员；工作区更换清空并拒绝旧回执', () => {
  const session = new UndoSession(); session.reset('workspace'); session.accept(result('create'))
  expect(session.entries).toHaveLength(1)
  expect(session.reset('workspace')).toBe(false)
  expect(session.entries).toHaveLength(1)
  session.reset('new-workspace')
  expect(session.entries).toHaveLength(0)
  expect(session.accept(result('old'))).toBe(false)
})
