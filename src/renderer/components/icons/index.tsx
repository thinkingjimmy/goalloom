/**
 * [INPUT]: Hugeicons 免费 Stroke Rounded 图标显式导入。
 * [OUTPUT]: 统一尺寸/线宽/装饰语义的 Icon，按钮由调用方命名。
 * [POS]: renderer 唯一图标入口，不使用 CDN、emoji 或第二图标库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, AlarmClockIcon, Archive02Icon, ArrowDataTransferVerticalIcon, ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, Cancel01Icon, Delete02Icon, DragDropVerticalIcon, GridViewIcon, HistoryIcon, InboxIcon, LayoutThreeColumnIcon, MinusSignIcon, MoreHorizontalIcon, Note01Icon, PaintBoardIcon, Search01Icon, SlidersHorizontalIcon, SquareLock02Icon, Tick02Icon, SparklesIcon, Key01Icon, Alert02Icon, Refresh01Icon, InformationCircleIcon, Link01Icon, GitBranchIcon } from '@hugeicons/core-free-icons'

const icons = { add: Add01Icon, appearance: PaintBoardIcon, calendar: Calendar03Icon, backup: Archive02Icon, transfer: ArrowDataTransferVerticalIcon, lock: SquareLock02Icon, minus: MinusSignIcon, overdue: AlarmClockIcon, expand: ArrowDown01Icon, previous: ArrowLeft01Icon, next: ArrowRight01Icon, close: Cancel01Icon, delete: Delete02Icon, drag: DragDropVerticalIcon, all: GridViewIcon, history: HistoryIcon, empty: InboxIcon, views: LayoutThreeColumnIcon, more: MoreHorizontalIcon, note: Note01Icon, search: Search01Icon, settings: SlidersHorizontalIcon, check: Tick02Icon, smart: SparklesIcon, key: Key01Icon, warning: Alert02Icon, refresh: Refresh01Icon, info: InformationCircleIcon, link: Link01Icon, split: GitBranchIcon }
export type IconName = keyof typeof icons
export function Icon({ name, size = 20, strokeWidth = 1.5 }: { name: IconName; size?: 12 | 14 | 16 | 18 | 20 | 24 | 44; strokeWidth?: number }) {
  return <HugeiconsIcon icon={icons[name]} size={size} strokeWidth={strokeWidth} color="currentColor" aria-hidden="true" />
}
