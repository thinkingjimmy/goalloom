/**
 * [INPUT]: zod 的运行时校验；main 提供的最小诊断数据。
 * [OUTPUT]: RuntimeInfo DTO、只读 GoalloomApi 和唯一 IPC 通道名。
 * [POS]: main/preload/renderer 共同边界；不暴露路径、SQL 或原始 IPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'

export const runtimeChannel = 'goalloom:runtime'
export const runtimeInfoSchema = z.strictObject({
  electron: z.string().min(1),
  node: z.string().min(1),
  sqlite: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.string().min(1),
})

export type RuntimeInfo = z.infer<typeof runtimeInfoSchema>
export interface GoalloomApi {
  getRuntime(): Promise<RuntimeInfo>
}
