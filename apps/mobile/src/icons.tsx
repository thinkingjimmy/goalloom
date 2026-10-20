/**
 * [INPUT]: Explicit Hugeicons free geometry, local colors and task completion state.
 * [OUTPUT]: Shared mobile icons and diagonal flow-color checkboxes.
 * [POS]: Local SVG presentation adapter; no remote icon loading.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId } from 'react'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import {
  Add01Icon, AlarmClockIcon, AppleIcon, ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUp01Icon, Cancel01Icon,
  Calendar03Icon, Layers01Icon, ComputerPhoneSyncIcon, Delete02Icon, GitBranchIcon, GridViewIcon, InboxIcon, InformationCircleIcon, Search01Icon,
  Link01Icon, Login01Icon, MoreHorizontalIcon, Note01Icon, PaintBoardIcon, SlidersHorizontalIcon,
  SmartPhone01Icon, SquareLock01Icon, Tick02Icon, ViewIcon, ViewOffIcon,
} from '@hugeicons/core-free-icons'

type SvgNode = readonly [string, { readonly [key: string]: string | number }]
const icons = {
  calendar: Calendar03Icon, layers: Layers01Icon, add: Add01Icon, overdue: AlarmClockIcon, back: ArrowLeft01Icon, down: ArrowDown01Icon, next: ArrowRight01Icon, send: ArrowUp01Icon, close: Cancel01Icon,
  trash: Delete02Icon, board: GridViewIcon, later: InboxIcon, info: InformationCircleIcon, link: Link01Icon,
  more: MoreHorizontalIcon, note: Note01Icon, appearance: PaintBoardIcon, settings: SlidersHorizontalIcon,
  flow: GitBranchIcon, check: Tick02Icon, phone: SmartPhone01Icon, eye: ViewIcon, eyeOff: ViewOffIcon,
  sync: ComputerPhoneSyncIcon, lock: SquareLock01Icon, login: Login01Icon, apple: AppleIcon, search: Search01Icon,
} as const
export type IconName = keyof typeof icons

export function Icon({ name, size = 20, color, strokeWidth = 1.6 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {(icons[name] as readonly SvgNode[]).map((node, index) => {
      const [tag, attributes] = node
      const stroke = attributes.stroke === undefined || attributes.stroke === 'currentColor' ? color : String(attributes.stroke)
      const width = strokeWidth
      if (tag === 'circle') return <Circle key={index} cx={Number(attributes.cx)} cy={Number(attributes.cy)} r={Number(attributes.r)} stroke={stroke} strokeWidth={width} fill="none" />
      if (tag === 'line') return <Line key={index} x1={Number(attributes.x1)} y1={Number(attributes.y1)} x2={Number(attributes.x2)} y2={Number(attributes.y2)} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
      return <Path key={index} d={String(attributes.d ?? '')} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    })}
  </Svg>
}

export function CheckBox({ done, strokes, fill, edge, checked }: { done: boolean; strokes: string[]; fill: string; edge: string; checked: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const split = !done && strokes.length > 1
  const solid = done ? checked : strokes[0] ?? edge
  return <Svg width={22} height={22} viewBox="0 0 22 22">
    {split && strokes[0] && strokes[1] && <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="50%" stopColor={strokes[0]} />
        <Stop offset="50%" stopColor={strokes[1]} />
      </LinearGradient>
    </Defs>}
    <Rect x={1.15} y={1.15} width={19.7} height={19.7} rx={6} fill={done ? checked : fill} strokeWidth={1.5} stroke={done ? checked : split ? `url(#${id})` : solid} />
    {done && <Path d="M6 11.5l3.2 3.2L16.3 7.6" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>
}
