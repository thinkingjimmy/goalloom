import { expect, it } from 'vitest'
import { relationColorIndex, relationColors } from '../../src/renderer/lib/colors'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}
function contrast(left: string, right: string): number {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

it('八组配对色文字至少 4.5:1，边框至少 3:1', () => {
  expect(relationColors).toHaveLength(8)
  for (const palette of relationColors) for (const [background, foreground, border] of [palette.light, palette.dark]) {
    expect(contrast(background, foreground)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(background, border)).toBeGreaterThanOrEqual(3)
  }
})
it('同 ID 索引稳定并均匀覆盖八个位置', () => {
  const indices = new Set(Array.from({ length: 100 }, (_, i) => relationColorIndex(`item-${i}`)))
  expect(indices.size).toBe(8)
  expect(relationColorIndex('item-1')).toBe(relationColorIndex('item-1'))
})
