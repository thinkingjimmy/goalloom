/**
 * [INPUT]: Hugeicons 免费 Stroke Rounded 图标显式导入。
 * [OUTPUT]: 统一尺寸/线宽/装饰语义的 Icon，按钮由调用方命名。
 * [POS]: renderer 唯一图标入口，不使用 CDN、emoji 或第二图标库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon, ComputerIcon, Moon02Icon, Sun03Icon, Shield01Icon } from '@hugeicons/core-free-icons'

const icons = { calendar: Calendar03Icon, system: ComputerIcon, moon: Moon02Icon, sun: Sun03Icon, shield: Shield01Icon }
export function Icon({ name, size = 20 }: { name: keyof typeof icons; size?: 16 | 20 | 24 | 32 }) {
  return <HugeiconsIcon icon={icons[name]} size={size} strokeWidth={1.5} color="currentColor" aria-hidden="true" />
}
