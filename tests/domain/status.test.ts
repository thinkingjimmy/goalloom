import { expect, it } from 'vitest'
import { changeStatus, reverseStatus } from '../../src/domain/status'

it('状态独立，重开后再次取消记录新的实际时间', () => {
  const before = changeStatus('cancelled', '2026-09-21T00:00:00Z')
  const reopened = changeStatus('todo', '2026-09-22T00:00:00Z')
  expect(reopened).toEqual({ status: 'todo', completedAt: null, cancelledAt: null })
  expect(changeStatus('cancelled', '2026-09-23T00:00:00Z').cancelledAt).not.toBe(before.cancelledAt)
  expect(reverseStatus(reopened, before, reopened)).toEqual(before)
})

it('逆转只修改状态时间组，保留最新文本、位置和版本', () => {
  const before = changeStatus('todo', '2026-09-21T00:00:00Z')
  const after = changeStatus('done', '2026-09-22T00:00:00Z')
  const latest = { ...after, title: '新标题', description: '保留说明', version: 12, horizon: 'day' }
  expect(reverseStatus(latest, before, after)).toEqual({ ...latest, ...before })
  expect(reverseStatus({ ...latest, status: 'cancelled' }, before, after)).toBeNull()
})
