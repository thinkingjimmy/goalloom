/**
 * [INPUT]: 主进程固定路径、当前显示器可用区域和窗口正常尺寸。
 * [OUTPUT]: 原子保存的窗口偏好与屏幕内的恢复矩形；不属于可重置业务库。
 * [POS]: 应用级窗口偏好库，跨工作区替换保留。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { readFile } from 'node:fs/promises'
import type { Rectangle } from 'electron'
import { z } from 'zod'
import { atomicJson } from '../storage/atomic-json'
const boundsSchema = z.strictObject({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(720).max(10_000), height: z.number().int().min(540).max(10_000), maximized: z.boolean() })
export async function loadWindowState(path: string, displays: Rectangle[]): Promise<(Rectangle & { maximized: boolean }) | null> {
  try {
    const state = boundsSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    const screen = displays.find(area => state.x < area.x + area.width && state.x + state.width > area.x && state.y < area.y + area.height && state.y + state.height > area.y) ?? displays[0]!
    const width = Math.max(720, Math.min(state.width, screen.width)), height = Math.max(540, Math.min(state.height, screen.height))
    return { x: Math.max(screen.x, Math.min(state.x, screen.x + screen.width - width)), y: Math.max(screen.y, Math.min(state.y, screen.y + screen.height - height)), width, height, maximized: state.maximized }
  } catch { return null }
}
export function saveWindowState(path: string, bounds: Rectangle, maximized: boolean): Promise<void> { return atomicJson(path, boundsSchema.parse({ ...bounds, maximized })) }
