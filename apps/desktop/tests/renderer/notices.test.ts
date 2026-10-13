import { expect, it } from 'vitest'
import { noticeOpen, readDismissed, timezoneNoticeToken, withDismissal } from '../../src/renderer/state/notices'

it('时区横幅在系统时区与工作区不同时出现，关闭后只在这对时区变化时回来', () => {
  expect(timezoneNoticeToken('Asia/Shanghai', 'Asia/Shanghai')).toBeNull()
  const token = timezoneNoticeToken('America/New_York', 'Asia/Shanghai')
  expect(token).toBe('America/New_York\nAsia/Shanghai')
  expect(noticeOpen(undefined, token)).toBe(true)
  const stored = withDismissal(null, 'timezone', token!)
  expect(noticeOpen(readDismissed(stored).timezone, token)).toBe(false)
  expect(noticeOpen(readDismissed(stored).timezone, timezoneNoticeToken('Europe/Paris', 'Asia/Shanghai'))).toBe(true)
  expect(noticeOpen(readDismissed(stored).timezone, timezoneNoticeToken('America/New_York', 'Asia/Tokyo'))).toBe(true)
  expect(noticeOpen(readDismissed(stored).timezone, null)).toBe(false)
})

it('备份错误按错误文本关闭，另一条错误会再出现', () => {
  const stored = withDismissal('{"timezone":"UTC\\nAsia/Shanghai"}', 'backup', 'disk full')
  const map = readDismissed(stored)
  expect(map.timezone).toBe('UTC\nAsia/Shanghai')
  expect(noticeOpen(map.backup, 'disk full')).toBe(false)
  expect(noticeOpen(map.backup, 'permission denied')).toBe(true)
})

it('损坏的关闭记录按未关闭处理', () => {
  expect(readDismissed('not-json')).toEqual({})
  expect(readDismissed('["timezone"]')).toEqual({})
  expect(readDismissed('{"timezone":1}')).toEqual({})
})
