import { expect, it } from 'vitest'
import { flowIndex } from '../../src/domain/flows'

it('沿多父 DAG 找到全部流程根，按首次出现去重', () => {
  const edges = [
    { parentId: 'goal-a', childId: 'month' }, { parentId: 'month', childId: 'week' },
    { parentId: 'goal-b', childId: 'week' }, { parentId: 'goal-a', childId: 'week' },
    { parentId: 'loose', childId: 'note' },
  ]
  const flows = flowIndex(edges, ['goal-a', 'goal-b'])
  expect(flows('goal-a')).toEqual(['goal-a'])
  expect(flows('month')).toEqual(['goal-a'])
  expect(flows('week')).toEqual(['goal-a', 'goal-b'])
  expect(flows('note')).toEqual([])
  expect(flows('unknown')).toEqual([])
})
