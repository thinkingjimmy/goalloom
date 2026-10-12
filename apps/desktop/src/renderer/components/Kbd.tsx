/**
 * [INPUT]: state/shortcuts 的组合键字符串与平台键帽符号。
 * [OUTPUT]: Kbd：一键一帽的组合键展示（平台符号 ⌘ ⇧ ⌥ / Ctrl Shift Alt）。
 * [POS]: 跨功能 UI 原语，快捷键设置等处复用；只展示，不监听按键。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { formatKeys } from '../state/shortcuts'

export function Kbd({ combo }: { combo: string }) {
  return <span className="keycaps">{formatKeys(combo).map((key, index) => <kbd key={index} className="keycap">{key}</kbd>)}</span>
}
