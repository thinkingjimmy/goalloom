/**
 * [INPUT]: Explicit Hugeicons free Stroke Rounded imports.
 * [OUTPUT]: Decorative Icon components, including pause, loading and period-return glyphs, and the same checkmark as a CSS mask for Lexical markers.
 * [POS]: The renderer's sole icon entry; accessible controls are named by their callers.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, AlarmClockIcon, Archive02Icon, ArchiveRestoreIcon, ArrowDataTransferVerticalIcon, ArrowDown01Icon, ArrowDown02Icon, ArrowUp01Icon, ArrowUp02Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowRight02Icon, ArrowTurnBackwardIcon, Calendar03Icon, Cancel01Icon, Delete02Icon, Download04Icon, DragDropVerticalIcon, GridViewIcon, HistoryIcon, InboxIcon, LayoutThreeColumnIcon, Loading03Icon, MinusSignIcon, MoreHorizontalIcon, Note01Icon, PaintBoardIcon, PauseCircleIcon, PartyPopperIcon, Search01Icon, SlidersHorizontalIcon, SquareLock02Icon, Tick02Icon, SparklesIcon, Key01Icon, Alert02Icon, Refresh01Icon, InformationCircleIcon, Link01Icon, GitBranchIcon, KeyboardIcon, PencilEdit02Icon, UnavailableIcon } from '@hugeicons/core-free-icons'

const icons = { later: InboxIcon, add: Add01Icon, pause: PauseCircleIcon, loading: Loading03Icon, appearance: PaintBoardIcon, calendar: Calendar03Icon, backup: Archive02Icon, archive: Archive02Icon, unarchive: ArchiveRestoreIcon, transfer: ArrowDataTransferVerticalIcon, lock: SquareLock02Icon, minus: MinusSignIcon, overdue: AlarmClockIcon, expand: ArrowDown01Icon, up: ArrowUp01Icon, parent: ArrowUp02Icon, child: ArrowDown02Icon, previous: ArrowLeft01Icon, next: ArrowRight01Icon, forward: ArrowRight02Icon, return: ArrowTurnBackwardIcon, confetti: PartyPopperIcon, close: Cancel01Icon, cancel: UnavailableIcon, delete: Delete02Icon, drag: DragDropVerticalIcon, all: GridViewIcon, history: HistoryIcon, download: Download04Icon, empty: InboxIcon, views: LayoutThreeColumnIcon, more: MoreHorizontalIcon, note: Note01Icon, search: Search01Icon, settings: SlidersHorizontalIcon, check: Tick02Icon, smart: SparklesIcon, key: Key01Icon, warning: Alert02Icon, refresh: Refresh01Icon, info: InformationCircleIcon, link: Link01Icon, split: GitBranchIcon, keyboard: KeyboardIcon, edit: PencilEdit02Icon }
export type IconName = keyof typeof icons
// Lexical owns checkbox DOM, so its pseudo-element uses the same bundled glyph.
const checkmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${Tick02Icon.map(([tag, attributes]) => {
  const values = Object.entries(attributes).filter(([name]) => name !== 'key').map(([name, value]) => `${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${value}"`).join(' ')
  return `<${tag} ${values}/>`
}).join('')}</svg>`
export const checkmarkMask = `url("data:image/svg+xml,${encodeURIComponent(checkmarkSvg)}")`

export function Icon({ name, size = 20, strokeWidth = 1.5 }: { name: IconName; size?: 12 | 14 | 16 | 18 | 20 | 24 | 44; strokeWidth?: number }) {
  return <HugeiconsIcon icon={icons[name]} size={size} strokeWidth={strokeWidth} color="currentColor" aria-hidden="true" />
}
