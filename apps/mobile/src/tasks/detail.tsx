/**
 * [INPUT]: Saved task, workspace graph, localized copy and guarded mutation callbacks.
 * [OUTPUT]: Editable grouped task details, independent child checks and flush-before-navigation.
 * [POS]: Mobile task-detail presentation; persistence and graph validation remain in the store.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { flowColors, flowStroke, type ItemRow, type LocaleId, type Snapshot } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { Icon, type IconName } from '../icons'
import type { Theme } from '../theme'
import type { Sheet } from '../view'
import { TaskCheckbox } from './checkbox'
import { DescriptionLinks } from './links'
import { TaskRow } from './row'

export const DetailCommit = createContext<RefObject<(() => boolean) | null> | null>(null)
type Fields = { title?: string; description?: string; dueDate?: string | null }

export function TaskDetail({ item, snap, theme, copy, locale, onSheet, onEdit, onCheck, onFlow, activity }: {
  item: ItemRow; snap: Snapshot; theme: Theme; copy: Copy; locale: LocaleId
  onSheet: (sheet: Sheet) => void; onEdit: (id: string, fields: Fields) => boolean
  onCheck: (item: ItemRow) => void; onFlow: (id: string, color: number | null) => void
  activity: (id: string) => { type: string; at: string }[]
}) {
  const commit = useContext(DetailCommit)
  const [draft, setDraft] = useState({ title: item.title, description: item.description })
  const [error, setError] = useState<string | null>(null)
  const [titleHeight, setTitleHeight] = useState(44), [descriptionHeight, setDescriptionHeight] = useState(72)
  const current = useRef(draft), saved = useRef(draft), edit = useRef(onEdit)
  edit.current = onEdit
  const flush = () => {
    const next = current.current
    if (!next.title.trim()) { setError(copy.task.required); return false }
    const fields: Fields = {}
    if (next.title !== saved.current.title) fields.title = next.title.trim()
    if (next.description !== saved.current.description) fields.description = next.description
    if (!Object.keys(fields).length) return true
    if (!edit.current(item.id, fields)) { setError(copy.conflict); return false }
    saved.current = { title: fields.title ?? saved.current.title, description: next.description }
    current.current = saved.current
    setDraft(saved.current); setError(null)
    return true
  }
  const latest = useRef(flush); latest.current = flush
  useEffect(() => {
    const handler = () => latest.current()
    if (commit) commit.current = handler
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') handler() })
    return () => { sub.remove(); if (commit?.current === handler) commit.current = null }
  }, [commit])
  useEffect(() => {
    const timer = setTimeout(() => { if (current.current.title.trim()) latest.current() }, 600)
    return () => clearTimeout(timer)
  }, [draft])
  const update = (field: 'title' | 'description', text: string) => {
    current.current = { ...current.current, [field]: text }; setDraft(current.current); setError(null)
  }
  const nodes = new Map(snap.items.map(row => [row.id, row]))
  const colors = flowColors(item.id, nodes, snap.relations)
  const owner = nodes.get(item.nestingParentId ?? '')
  const parents = snap.relations.filter(edge => edge.childId === item.id).flatMap(edge => { const row = nodes.get(edge.parentId); return row ? [row] : [] })
  const children = snap.items.filter(row => row.nestingParentId === item.id).sort((a, b) => a.sortKey - b.sortKey)
  const due = item.dueDate ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.dueDate}T12:00:00Z`)) : copy.noDue
  const names: Record<string, string> = { created: copy.activityCreated, moved: copy.activityMoved, status_changed: copy.activityStatus, deleted: copy.activityDeleted, item_restored: copy.activityRestored, nesting_changed: copy.activityNest, edited: copy.activityEdit, rolled_over: copy.activityRoll, undo: copy.undo }
  const card = { backgroundColor: theme.raised, borderRadius: theme.cardRadius, borderColor: theme.line, borderWidth: theme.style === 'minimal' ? StyleSheet.hairlineWidth : 0 }
  return <View testID="task-detail" style={styles.body}>
    <View style={card}>
      <View style={styles.titleRow}>
        <TaskCheckbox item={item} colors={colors} theme={theme} copy={copy} checkStyle={snap.checkStyle} onCheck={() => { if (flush()) onCheck(item) }} />
        <TextInput testID="task-detail-title" accessibilityLabel={copy.task.title} multiline maxLength={500} onContentSizeChange={event => setTitleHeight(Math.max(44, event.nativeEvent.contentSize.height))} value={draft.title} onChangeText={text => update('title', text)} onBlur={flush}
          style={[styles.title, { height: titleHeight, color: theme.fg, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }]} />
      </View>
      <View style={styles.description}>
        <Icon name="note" color={theme.secondary} size={20} />
        <TextInput testID="task-detail-description" accessibilityLabel={copy.description} multiline onContentSizeChange={event => setDescriptionHeight(Math.max(72, event.nativeEvent.contentSize.height))} value={draft.description} placeholder={copy.describe} placeholderTextColor={theme.secondary}
          onChangeText={text => update('description', text)} onBlur={flush} style={[styles.descriptionInput, { height: descriptionHeight, color: theme.fg }]} />
      </View>
      <View style={styles.inlineLinks}><DescriptionLinks text={`${draft.title}\n${draft.description}`} theme={theme} copy={copy} /></View>
      {owner && <Property icon="board" label={copy.belongs} value={owner.title} theme={theme} onPress={() => onSheet({ kind: 'detail', id: owner.id })} />}
      <Property icon="layers" label={copy.task.horizon} value={copy[item.horizon]} theme={theme} onPress={() => onSheet({ kind: 'move', id: item.id, fromDetail: true })} />
      <Property icon="calendar" label={copy.due} value={due} theme={theme} danger={!!item.dueDate && item.status !== 'done' && item.dueDate < snap.today} onPress={() => onSheet({ kind: 'due', id: item.id, fromDetail: true })} />
    </View>
    {error && <Pressable accessibilityRole="button" onPress={flush} style={styles.error}><Text accessibilityRole="alert" style={{ color: theme.danger }}>{error} · {copy.task.retry}</Text></Pressable>}
    {!owner && item.horizon !== 'later' && <>
      <Text style={[styles.section, { color: theme.secondary }]}>{copy.parent}</Text>
      <View style={card}>
        {parents.map(parent => <Property key={parent.id} icon="flow" label={copy.parent} value={parent.title} theme={theme} onPress={() => onSheet({ kind: 'detail', id: parent.id })} />)}
        <Property icon="link" label={copy.parent} value={parents.length ? copy.parent : copy.noParent} theme={theme} onPress={() => onSheet({ kind: 'parent', id: item.id, fromDetail: true })} />
        {!parents.length && <View style={styles.palette} accessibilityLabel={copy.flowField}>{Array.from({ length: 8 }, (_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${copy.flowField} ${index + 1}`} accessibilityState={{ selected: item.flowColor === index }} onPress={() => { if (flush()) onFlow(item.id, item.flowColor === index ? null : index) }} style={styles.swatchHit}>
          <View style={[styles.swatch, { backgroundColor: flowStroke(index, theme.scheme), borderColor: theme.fg, borderWidth: item.flowColor === index ? 2 : 0 }]} />
        </Pressable>)}</View>}
      </View>
    </>}
    {!owner && <>
      <View style={styles.sectionLine}><Text style={[styles.section, { color: theme.secondary }]}>{copy.subtasks}</Text><Text style={{ color: theme.secondary, fontSize: 13 }}>{children.filter(row => row.status === 'done').length}/{children.length}</Text></View>
      <View style={card}>
        {children.map(child => <TaskRow key={child.id} item={child} theme={theme} copy={copy} colors={flowColors(child.id, nodes, snap.relations)} today={snap.today} checkStyle={snap.checkStyle} preview={false} onOpen={() => onSheet({ kind: 'detail', id: child.id })} onCheck={() => { if (flush()) onCheck(child) }} />)}
        <Property icon="add" label={copy.addSub} value={copy.addSub} theme={theme} onPress={() => onSheet({ kind: 'add', horizon: item.horizon, periodId: item.periodId, nestingParentId: item.id, returnTo: item.id })} />
      </View>
    </>}
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.activity}</Text>
    {activity(item.id).map((event, index) => <View key={`${event.at}-${index}`} style={styles.event}><Text style={{ color: theme.secondary, flex: 1, fontSize: 13 }}>{names[event.type] ?? event.type}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{event.at.slice(5, 10)}</Text></View>)}
  </View>
}

function Property({ icon, label, value, theme, onPress, danger = false }: { icon: IconName; label: string; value: string; theme: Theme; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={styles.property}>
    <Icon name={icon} color={danger ? theme.danger : theme.secondary} size={21} />
    <Text style={[styles.propertyValue, { color: danger ? theme.danger : theme.fg }]}>{value}</Text>
    <Icon name="next" size={15} color={theme.secondary} />
  </Pressable>
}

const styles = StyleSheet.create({
  body: { paddingBottom: 24 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 1, paddingRight: 14, paddingTop: 8 },
  title: { flex: 1, fontSize: 21, lineHeight: 28, fontWeight: '600', paddingVertical: 7, minHeight: 44 },
  description: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: 13, paddingRight: 14, paddingVertical: 8 },
  descriptionInput: { flex: 1, fontSize: 16, lineHeight: 23, minHeight: 44, paddingVertical: 0 }, inlineLinks: { marginLeft: 46, marginRight: 14 },
  property: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  propertyValue: { flex: 1, fontSize: 16, lineHeight: 22 }, section: { fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 9, marginLeft: 12 },
  sectionLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, palette: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingBottom: 6 },
  swatchHit: { width: '25%', height: 44, alignItems: 'center', justifyContent: 'center' }, swatch: { width: 24, height: 24, borderRadius: 8 },
  event: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 12 }, error: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
})
