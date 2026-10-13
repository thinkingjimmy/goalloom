import { expect, it } from 'vitest'
import { flowRing, relationColors } from '../../src/renderer/lib/colors'
import { zh } from '../../src/renderer/i18n/locales/zh'
import { en } from '../../src/renderer/i18n/locales/en'
import { ja } from '../../src/renderer/i18n/locales/ja'
import { es } from '../../src/renderer/i18n/locales/es'
import { fr } from '../../src/renderer/i18n/locales/fr'

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
it('流程描边在浅/深复选框底色上至少 3:1，且色名唯一', () => {
  for (const catalog of [zh, en, ja, es, fr]) expect(new Set(catalog.messages.colorNames).size).toBe(relationColors.length)
  for (const palette of relationColors) {
    expect(contrast('#e7e2db', palette.light[2])).toBeGreaterThanOrEqual(3)
    expect(contrast('#3a342e', palette.dark[2])).toBeGreaterThanOrEqual(3)
  }
})
it('一个流程为单色描边，两个流程为对角拼色', () => {
  expect(flowRing([])).toBeUndefined()
  expect(flowRing([1])).toBe('linear-gradient(light-dark(#547aaa, #85a8d9), light-dark(#547aaa, #85a8d9))')
  expect(flowRing([1, 2])).toContain('135deg')
})
