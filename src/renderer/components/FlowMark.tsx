/**
 * [INPUT]: 0–2 个流程色板索引。
 * [OUTPUT]: 与复选框同构的描边小方块；装饰性，名称由调用方提供。
 * [POS]: 流程颜色的统一视觉记号，筛选、选择器与详情共用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { CSSProperties } from 'react'
import { flowRing } from '../lib/colors'

export function FlowMark({ colors, dashed = false }: { colors: number[]; dashed?: boolean }) {
  const ring = flowRing(colors)
  return <span aria-hidden="true" className={`flow-mark ${dashed ? 'flow-mark-dashed' : ''}`} style={ring ? { '--flow-ring': ring } as CSSProperties : undefined} />
}
