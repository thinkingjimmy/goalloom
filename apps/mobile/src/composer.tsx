/**
 * [INPUT]: The open column, parsed capture text and the visible columns.
 * [OUTPUT]: A keyboard-docked quick-add bar. Send creates the drafts and shows no toast.
 * [POS]: Mobile capture. Same parse and per-item column, due date and parent as the old composer.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Animated, Easing, Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  mayLink, parseCapture, sheetRelease, shouldDragSheet, withCaptureColumn,
  type CaptureDraft, type Horizon, type Snapshot,
} from '@goalloom/local-store'
import type { Copy } from './copy'
import { Icon } from './icons'
import type { Theme } from './theme'

const PREVIEW_ROWS = 4
const ROW_HEIGHT = 58

export function Composer({ copy, theme, snap, seed, horizon, columns, bottom, onCreate, onDismiss }: {
  copy: Copy
  theme: Theme
  snap: Snapshot
  seed: string
  horizon: Horizon
  columns: readonly Horizon[]
  bottom: number
  onCreate: (drafts: CaptureDraft[]) => boolean
  onDismiss: () => void
}) {
  const [text, setText] = useState(seed)
  const [column, setColumn] = useState(horizon)
  const [later, setLater] = useState(false)
  const [laterDue, setLaterDue] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<number, CaptureDraft>>({})
  const [removed, setRemoved] = useState<number[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [dueDraft, setDueDraft] = useState<Record<number, string>>({})
  const input = useRef<TextInput>(null)
  const scrollY = useRef(0)
  const parsed = parseCapture(text, snap.today, snap.items)
  const choices = columns.includes(column) ? columns : [column, ...columns]
  const rows: { key: number; draft: CaptureDraft }[] = later
    ? (text.trim() ? [{ key: -1, draft: { title: text.trim(), horizon: 'later', dueDate: laterDue, parentId: null } }] : [])
    : parsed.flatMap((row, index) => removed.includes(index) || !row ? [] : [{ key: index, draft: touched[index] ?? withCaptureColumn([row], column)[0]! }])
      .filter(entry => entry.draft.title.trim())
  const canSend = rows.length > 0

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false))
    const focus = setTimeout(() => input.current?.focus(), 50)
    return () => { show.remove(); hide.remove(); clearTimeout(focus) }
  }, [])
  useEffect(() => { if (rows.length < PREVIEW_ROWS) scrollY.current = 0 }, [rows.length])

  const rewrite = (value: string) => {
    setText(value)
    setTouched({})
    setRemoved([])
    setEditing(null)
    setLaterDue(null)
    setDueDraft({})
    scrollY.current = 0
  }
  const editRow = (index: number, source: CaptureDraft, patch: Partial<CaptureDraft>) => {
    const current = touched[index] ?? withCaptureColumn([source], column)[0]!
    setTouched(currentTouched => ({ ...currentTouched, [index]: { ...current, ...patch } }))
  }
  const send = () => {
    if (!canSend) return
    if (onCreate(rows.map(entry => entry.draft))) onDismiss()
  }

  return <Dismissable onDismiss={onDismiss} scrollY={scrollY}>
    <View style={{ marginBottom: keyboard ? 8 : bottom, gap: 8 }}>
      {columnsOpen && <View style={[styles.card, surface(theme)]}>
        {choices.map(choice => <Pressable key={choice} onPress={() => { setColumn(choice); setColumnsOpen(false) }} style={styles.choice}>
          <Text style={{ color: theme.fg, flex: 1, fontSize: 16 }}>{copy[choice]}</Text>
          {choice === column && <Icon name="check" size={18} color={theme.fg} />}
        </Pressable>)}
      </View>}
      {rows.length > 0 && <View style={[styles.card, surface(theme)]}>
        <ScrollView style={{ maxHeight: PREVIEW_ROWS * ROW_HEIGHT }} scrollEnabled={rows.length >= PREVIEW_ROWS} keyboardShouldPersistTaps="handled" bounces={false} onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y }} scrollEventThrottle={16}>
          {rows.map(entry => {
            const open = editing === entry.key
            const source = entry.key >= 0 ? parsed[entry.key] : undefined
            return <View key={entry.key} style={styles.item}>
              <Pressable onPress={() => setEditing(open ? null : entry.key)} style={styles.itemMain}>
                <Text numberOfLines={1} style={{ color: theme.fg, fontSize: 15 }}>{entry.draft.title}</Text>
                <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, marginTop: 2 }}>{detailLine(copy, entry.draft, snap.items)}</Text>
              </Pressable>
              <Pressable onPress={() => {
                if (entry.key < 0) rewrite('')
                else setRemoved(current => current.includes(entry.key) ? current : [...current, entry.key])
                if (editing === entry.key) setEditing(null)
              }} hitSlop={8} accessibilityLabel={copy.close}><Icon name="close" size={16} color={theme.secondary} /></Pressable>
              {open && <View style={styles.editor}>
                <TextInput value={entry.draft.title} onChangeText={title => {
                  if (entry.key < 0) setText(title)
                  else if (source) editRow(entry.key, source, { title })
                }} style={[styles.editorInput, { color: theme.fg, borderColor: theme.line }]} />
                {entry.key >= 0 && source && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
                  {choices.map(choice => <Pressable key={choice} onPress={() => editRow(entry.key, source, { horizon: choice, ...(choice === 'later' ? { parentId: null } : {}) })} style={[styles.chip, { backgroundColor: entry.draft.horizon === choice ? theme.fg : theme.hover }]}>
                    <Text style={{ color: entry.draft.horizon === choice ? theme.onAccent : theme.secondary, fontSize: 12 }}>{copy[choice]}</Text>
                  </Pressable>)}
                </ScrollView>}
                <TextInput value={dueDraft[entry.key] ?? entry.draft.dueDate ?? ''} onChangeText={value => {
                  setDueDraft(current => ({ ...current, [entry.key]: value }))
                  const dueDate = value === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
                  if (dueDate === undefined) return
                  if (entry.key < 0) setLaterDue(dueDate)
                  else if (source) editRow(entry.key, source, { dueDate })
                }} placeholder="YYYY-MM-DD" placeholderTextColor={theme.faint} style={[styles.editorInput, { color: theme.fg, borderColor: theme.line }]} />
                {entry.draft.dueDate && <Pressable onPress={() => {
                  if (entry.key < 0) setLaterDue(null)
                  else if (source) editRow(entry.key, source, { dueDate: null })
                }}><Text style={{ color: theme.secondary, fontSize: 13 }}>{copy.noDue}</Text></Pressable>}
                {entry.draft.horizon !== 'later' && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
                  <Pressable onPress={() => source && editRow(entry.key, source, { parentId: null })} style={[styles.chip, { backgroundColor: entry.draft.parentId ? theme.hover : theme.fg }]}>
                    <Text style={{ color: entry.draft.parentId ? theme.secondary : theme.onAccent, fontSize: 12 }}>{copy.noParent}</Text>
                  </Pressable>
                  {snap.items.filter(item => mayLink(item.horizon, entry.draft.horizon)).map(item => <Pressable key={item.id} onPress={() => source && editRow(entry.key, source, { parentId: item.id })} style={[styles.chip, { backgroundColor: entry.draft.parentId === item.id ? theme.fg : theme.hover }]}>
                    <Text style={{ color: entry.draft.parentId === item.id ? theme.onAccent : theme.secondary, fontSize: 12 }}>{item.title}</Text>
                  </Pressable>)}
                </ScrollView>}
              </View>}
            </View>
          })}
        </ScrollView>
      </View>}
      <View style={[styles.bar, surface(theme)]}>
        <TextInput ref={input} autoFocus multiline blurOnSubmit={false} value={text} onChangeText={rewrite} placeholder={copy.capturePlaceholder} placeholderTextColor={theme.faint} style={[styles.input, { color: theme.fg }]} />
        <View style={styles.tools}>
          <Pressable onPress={() => setColumnsOpen(open => !open)} style={[styles.chip, { backgroundColor: theme.hover }]} accessibilityRole="button">
            <Text style={{ color: theme.fg, fontSize: 13, fontWeight: '600' }}>{copy[column]} ▾</Text>
          </Pressable>
          <Pressable onPress={() => setLater(value => !value)} style={[styles.chip, { backgroundColor: later ? theme.fg : theme.hover }]} accessibilityRole="button" accessibilityState={{ selected: later }}>
            <Text style={{ color: later ? theme.onAccent : theme.fg, fontSize: 13, fontWeight: '600' }}>{copy.later}</Text>
          </Pressable>
          {rows.length > 0 && <Text style={{ color: theme.secondary, fontSize: 13 }}>{copy.itemCount(rows.length)}</Text>}
          <View style={styles.flex} />
          <Pressable onPress={send} disabled={!canSend} accessibilityRole="button" accessibilityLabel={copy.send} accessibilityState={{ disabled: !canSend }} style={[styles.send, { backgroundColor: canSend ? theme.fg : theme.hover }]}>
            <Icon name="send" size={18} color={canSend ? theme.onAccent : theme.faint} />
          </Pressable>
        </View>
      </View>
    </View>
  </Dismissable>
}

function Dismissable({ onDismiss, scrollY, children }: { onDismiss: () => void; scrollY: RefObject<number>; children: ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current
  const host = useRef<View>(null)
  const top = useRef(0)
  const height = useRef(240)
  const lead = useRef(0)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const measure = () => {
    host.current?.measureInWindow((_x, y, _width, measured) => {
      top.current = y
      if (measured > 0) height.current = measured
    })
  }
  const release = (distance: number, velocity: number) => {
    if (sheetRelease(distance, velocity, height.current)) {
      const remaining = Math.max(height.current - distance, 0)
      const duration = Math.min(260, Math.max(140, remaining / Math.max(velocity, 0.8)))
      Animated.timing(translateY, { toValue: height.current + 48, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) dismiss.current()
      })
    } else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start()
  }
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const take = shouldDragSheet(gesture.dy, gesture.dx, scrollY.current ?? 0, gesture.moveY - gesture.dy - top.current)
      if (take) lead.current = gesture.dy
      return take
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { translateY.stopAnimation() },
    onPanResponderMove: (_event, gesture) => { translateY.setValue(Math.max(0, lead.current + gesture.dy)) },
    onPanResponderRelease: (_event, gesture) => release(Math.max(0, lead.current + gesture.dy), gesture.vy),
    onPanResponderTerminate: () => release(0, 0),
  })).current
  return <Animated.View ref={host} collapsable={false} onLayout={measure} {...pan.panHandlers} style={{ transform: [{ translateY }] }}>{children}</Animated.View>
}

function detailLine(copy: Copy, draft: CaptureDraft, items: Snapshot['items']): string {
  const parts = [copy[draft.horizon]]
  if (draft.dueDate) parts.push(weekdayShort(draft.dueDate, copy.weekdaysShort))
  const parent = draft.parentId ? items.find(item => item.id === draft.parentId)?.title : undefined
  if (parent) parts.push(`↳ ${parent}`)
  return parts.join(' · ')
}

function weekdayShort(date: string, names: readonly string[]): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return names[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? date
}

function surface(theme: Theme) {
  const minimal = theme.style === 'minimal'
  return {
    backgroundColor: theme.raised,
    borderColor: minimal ? theme.line : theme.edge,
    borderWidth: minimal ? 1 : StyleSheet.hairlineWidth,
    ...(minimal ? { elevation: 0 } : { shadowColor: theme.scheme === 'dark' ? '#000' : '#3c2814', shadowOpacity: theme.scheme === 'dark' ? 0.35 : 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 }),
  }
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 10, borderRadius: 16, overflow: 'hidden' },
  choice: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  item: { minHeight: ROW_HEIGHT, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  itemMain: { flex: 1, minWidth: 0 },
  editor: { width: '100%', gap: 8, paddingBottom: 4 },
  editorInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  bar: { marginHorizontal: 10, borderRadius: 22, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 8 },
  input: { fontSize: 16, lineHeight: 22, maxHeight: 88, minHeight: 22, padding: 0 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
})
