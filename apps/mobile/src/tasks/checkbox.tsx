/**
 * [INPUT]: Saved item state, inherited flow indices and workspace appearance.
 * [OUTPUT]: A labelled 44pt checkbox with shared flow borders and independent completion.
 * [POS]: Task control shared by the board and task details; does not change flow-page rendering.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Pressable, StyleSheet } from 'react-native'
import { flowStroke, flowTint, type CheckStyle, type ItemRow } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { CheckBox } from '../icons'
import type { Theme } from '../theme'

export function TaskCheckbox({ item, colors, checkStyle, theme, copy, onCheck, disabled = false }: {
  item: ItemRow; colors: number[]; checkStyle: CheckStyle; theme: Theme; copy: Copy
  onCheck: () => void; disabled?: boolean
}) {
  const done = item.status === 'done'
  const palette = item.horizon === 'later' || done ? [] : colors
  const first = palette[0]
  const fill = done ? theme.checked : checkStyle === 'outline' ? 'none'
    : checkStyle === 'tint' && first !== undefined ? flowTint(first, theme.scheme) : theme.checkFill
  return <Pressable testID={`task-check-${item.id}`} accessibilityRole="checkbox"
    accessibilityLabel={`${done ? copy.reopen : copy.complete} ${item.title}`}
    aria-checked={done} aria-disabled={disabled} accessibilityState={{ checked: done, disabled }} disabled={disabled}
    onPressIn={event => event.stopPropagation()}
    onPress={event => { event.stopPropagation(); onCheck() }} style={styles.hit}>
    <CheckBox done={done} strokes={palette.map(index => flowStroke(index, theme.scheme))} fill={fill} edge={theme.checkEdge} checked={theme.checked} />
  </Pressable>
}

const styles = StyleSheet.create({ hit: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } })
