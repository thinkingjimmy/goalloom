/**
 * [INPUT]: A saved task, inherited colors optional detail insets and optional board placement gestures.
 * [OUTPUT]: Compact task rows with 24pt nesting, note/deadline signals and offline title-link cards.
 * [POS]: Board and child-task presentation; completion, ownership and persistence stay in the caller.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { classifyPointer, completionLabel, linkHost, LONG_PRESS_MS, NEST_INDENT, type CheckStyle, type ItemRow } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { Icon } from '../icons'
import type { Theme } from '../theme'
import { TaskCheckbox } from './checkbox'
import { TaskLinkPreviews } from './links'

export function TaskRow({ item, copy, theme, nested = false, lifted = false, colors, checkStyle, today, onCheck, onOpen, onMenu, onDrag, onDrop, preview = true, owner, inset = 9 }: {
  item: ItemRow; copy: Copy; theme: Theme; nested?: boolean; lifted?: boolean; colors: number[]; checkStyle: CheckStyle; today: string
  onCheck: () => void; onOpen: () => void; onMenu?: () => void; onDrag?: (y: number) => void; onDrop?: () => void; preview?: boolean; owner?: ItemRow; inset?: number
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef({ x: 0, y: 0, t: 0 })
  const phase = useRef<'pending' | 'scroll' | 'paging' | 'drag' | 'menu'>('pending')
  const consumed = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current) }
  useEffect(() => () => clear(), [])
  const begin = (x: number, y: number) => {
    clear(); consumed.current = false; phase.current = 'pending'
    origin.current = { x, y, t: Date.now() }
    if (onMenu) timer.current = setTimeout(() => {
      if (phase.current === 'pending') { consumed.current = true; phase.current = 'menu'; onMenu() }
    }, LONG_PRESS_MS)
  }
  const move = (x: number, y: number) => {
    const next = classifyPointer(x - origin.current.x, y - origin.current.y, Date.now() - origin.current.t)
    if (phase.current === 'pending' && (next === 'scroll' || next === 'paging')) { phase.current = next; consumed.current = true; clear() }
    if (next === 'drag' && onDrag && phase.current !== 'scroll' && phase.current !== 'paging') {
      clear(); consumed.current = true; phase.current = 'drag'; onDrag(y)
    }
  }
  const end = () => { clear(); if (phase.current === 'drag') onDrop?.(); phase.current = 'pending' }
  const done = item.status === 'done', note = item.note
  const progress = note?.tasks ? completionLabel('note', note.tasks.done, note.tasks.total) : null
  const words = note?.tasks ? note.next : note?.excerpt
  const overdue = !done && item.dueDate !== null && item.dueDate < today
  return <View testID={`task-row-${item.id}`}>
    <Pressable onPress={() => { if (!consumed.current) onOpen() }} onPressIn={event => begin(event.nativeEvent.pageX, event.nativeEvent.pageY)}
      onPressOut={end} onTouchMove={event => move(event.nativeEvent.pageX, event.nativeEvent.pageY)}
      style={[styles.row, { paddingLeft: inset + (nested ? NEST_INDENT : 0) }, theme.style === 'minimal' && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline },
        lifted && { transform: [{ translateY: -28 }, { scale: 1.02 }], backgroundColor: theme.raised, borderRadius: theme.rowRadius, zIndex: 2 }]}>
      <TaskCheckbox item={item} colors={colors} checkStyle={checkStyle} theme={theme} copy={copy} onCheck={onCheck} />
      <View style={styles.content}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: done ? theme.secondary : theme.fg, textDecorationLine: done ? 'line-through' : 'none' }]}>{item.title}</Text>
          {!done && item.dueDate && <View style={styles.due} accessibilityLabel={`${copy.due} ${item.dueDate}`}>
            {overdue ? <Icon name="overdue" size={16} color={theme.danger} /> : <Text style={{ color: theme.secondary, fontSize: 12 }}>{shortDate(item.dueDate)}</Text>}
          </View>}
        </View>
        {note && <View style={styles.signal}>
          {progress && <Text style={[styles.note, { color: theme.secondary }]}>{progress}</Text>}
          {note.links[0] && <Text numberOfLines={1} style={[styles.note, styles.host, { color: theme.secondary }]}>{linkHost(note.links[0])}</Text>}
          {!!words && <Text numberOfLines={1} style={[styles.note, styles.words, { color: theme.secondary }]}>{words}</Text>}
        </View>}
        {owner && !nested && <Text numberOfLines={2} style={[styles.note, { color: theme.secondary }]}>{copy.follows(owner.title)}</Text>}
      </View>
    </Pressable>
    {preview && <View style={{ marginLeft: 20 + (nested ? NEST_INDENT : 0), marginRight: 16 }}><TaskLinkPreviews text={item.title} copy={copy} theme={theme} /></View>}
  </View>
}

function shortDate(value: string) { const [, month, day] = value.split('-'); return `${Number(month)}/${Number(day)}` }

const styles = StyleSheet.create({
  row: { minHeight: 44, paddingRight: 16, flexDirection: 'row', alignItems: 'flex-start' },
  content: { flex: 1, minWidth: 0, paddingVertical: 10 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  due: { minHeight: 22, justifyContent: 'center' },
  signal: { flexDirection: 'row', gap: 7, marginTop: 2, alignItems: 'center' },
  note: { fontSize: 12, lineHeight: 17 }, host: { flexShrink: 1 }, words: { flex: 1 },
})
