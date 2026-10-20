/**
 * [INPUT]: Saved task, workspace graph, localized copy and guarded mutation callbacks.
 * [OUTPUT]: Rounded task details with semantic properties, horizon-labelled goals, child progress and flush-before-navigation.
 * [POS]: Mobile task-detail presentation; persistence and graph validation remain in the store.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { flowColors, flowStroke, type ItemRow, type LocaleId, type Snapshot } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { Icon, type IconName } from '../icons'
import type { Theme } from '../theme'
import type { Sheet } from '../view'
import { TaskCheckbox } from './checkbox'
import { DescriptionLinks } from './links'
import { TaskRow } from './row'
import { GrowingTaskInput } from './input'

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
  const card = { backgroundColor: theme.raised, borderRadius: theme.style === 'paper' ? 22 : theme.cardRadius, paddingHorizontal: 14, paddingVertical: 4, overflow: 'hidden' as const, borderColor: theme.line, borderWidth: theme.style === 'minimal' ? StyleSheet.hairlineWidth : 0 }
  return <View testID="task-detail" style={styles.body}>
    <View testID="task-detail-main-card" style={card}>
      <View style={styles.titleRow}>
        <TaskCheckbox item={item} colors={colors} theme={theme} copy={copy} checkStyle={snap.checkStyle} onCheck={() => { if (flush()) onCheck(item) }} />
        <GrowingTaskInput containerStyle={{ flex: 1 }} testID="task-detail-title" accessibilityLabel={copy.task.title} maxLength={500} value={draft.title} onChangeText={text => update('title', text)} onBlur={flush}
          style={[styles.title, { color: theme.fg, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }]} />
      </View>
      <View style={styles.description}>
        <GrowingTaskInput testID="task-detail-description" accessibilityLabel={copy.description} value={draft.description} placeholder={copy.describe} placeholderTextColor={theme.secondary}
          onChangeText={text => update('description', text)} onBlur={flush} style={[styles.descriptionInput, { color: theme.fg }]} />
      </View>
      <View style={styles.inlineLinks}><DescriptionLinks text={`${draft.title}\n${draft.description}`} theme={theme} copy={copy} /></View>
      {owner && <Property icon="board" label={copy.belongs} value={owner.title} theme={theme} onPress={() => onSheet({ kind: 'detail', id: owner.id })} />}
      <Property testID="task-detail-horizon" iconColor={flowStroke(1, theme.scheme)} icon="layers" label={copy.task.horizon} value={copy[item.horizon]} theme={theme} onPress={() => onSheet({ kind: 'move', id: item.id, fromDetail: true })} />
      <Property testID="task-detail-due" separator iconColor={flowStroke(2, theme.scheme)} icon="calendar" label={copy.due} value={due} theme={theme} danger={!!item.dueDate && item.status !== 'done' && item.dueDate < snap.today} onPress={() => onSheet({ kind: 'due', id: item.id, fromDetail: true })} />
    </View>
    {error && <Pressable accessibilityRole="button" onPress={flush} style={styles.error}><Text accessibilityRole="alert" style={{ color: theme.danger }}>{error} · {copy.task.retry}</Text></Pressable>}
    {!owner && item.horizon !== 'later' && <>
      <SectionHeading title={copy.task.relatedGoals} count={copy.itemCount(parents.length)} theme={theme}
        actionLabel={copy.parent} onAction={() => onSheet({ kind: 'parent', id: item.id, fromDetail: true })} />
      <View testID="task-detail-goals" style={card}>
        {parents.map(parent => <Pressable key={parent.id} testID={`task-detail-goal-${parent.id}`} accessibilityRole="button"
          accessibilityLabel={`${copy[parent.horizon]} · ${parent.title}`} onPress={() => onSheet({ kind: 'detail', id: parent.id })}
          style={({ pressed }) => [styles.goal, pressed && { backgroundColor: theme.hover }]}>
          <Text style={[styles.goalHorizon, { color: theme.secondary }]}>{copy[parent.horizon]}</Text>
          <Text style={[styles.goalTitle, { color: theme.fg }]}>{parent.title}</Text>
        </Pressable>)}
        {!parents.length && <Text style={[styles.empty, { color: theme.secondary }]}>{copy.noParent}</Text>}
        {!parents.length && <View style={styles.palette} accessibilityLabel={copy.flowField}>{Array.from({ length: 8 }, (_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${copy.flowField} ${index + 1}`} accessibilityState={{ selected: item.flowColor === index }} onPress={() => { if (flush()) onFlow(item.id, item.flowColor === index ? null : index) }} style={styles.swatchHit}>
          <View style={[styles.swatch, { backgroundColor: flowStroke(index, theme.scheme), borderColor: theme.fg, borderWidth: item.flowColor === index ? 2 : 0 }]} />
        </Pressable>)}</View>}
      </View>
    </>}
    {!owner && <>
      <SectionHeading title={copy.task.children} count={`${children.filter(row => row.status === 'done').length}/${children.length}`} theme={theme} />
      <View testID="task-detail-children" style={card}>
        <View style={styles.children}>{children.map(child => <TaskRow key={child.id} inset={4} item={child} theme={theme} copy={copy} colors={flowColors(child.id, nodes, snap.relations)} today={snap.today} checkStyle={snap.checkStyle} preview={false} onOpen={() => onSheet({ kind: 'detail', id: child.id })} onCheck={() => { if (flush()) onCheck(child) }} />)}</View>
        <Property testID="task-detail-add-child" icon="add" label={copy.task.addChild} value={copy.task.addChild} theme={theme} onPress={() => onSheet({ kind: 'add', horizon: item.horizon, periodId: item.periodId, nestingParentId: item.id, returnTo: item.id })} />
      </View>
    </>}
    <SectionHeading title={copy.activity} theme={theme} />
    {activity(item.id).map((event, index) => <View key={`${event.at}-${index}`} style={styles.event}><Text style={{ color: theme.secondary, flex: 1, fontSize: 13 }}>{names[event.type] ?? event.type}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{event.at.slice(5, 10)}</Text></View>)}
  </View>
}

function SectionHeading({ title, count, theme, actionLabel, onAction }: {
  title: string; count?: string; theme: Theme; actionLabel?: string; onAction?: () => void
}) {
  return <View style={styles.sectionLine}>
    <Text accessibilityRole="header" style={[styles.section, { color: theme.fg }]}>{title}</Text>
    {onAction ? <Pressable testID="task-detail-edit-goals" accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.sectionAction}>
      <Text style={[styles.count, { color: theme.secondary }]}>{count}</Text><Icon name="link" size={16} color={theme.secondary} />
    </Pressable> : count !== undefined && <Text testID="task-detail-child-progress" style={[styles.count, { color: theme.secondary }]}>{count}</Text>}
  </View>
}

function Property({ icon, label, value, theme, onPress, danger = false, iconColor, separator = false, testID }: {
  icon: IconName; label: string; value: string; theme: Theme; onPress: () => void
  danger?: boolean; iconColor?: string; separator?: boolean; testID?: string
}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress}
    style={({ pressed }) => [styles.property, separator && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }, pressed && { backgroundColor: theme.hover }]}>
    <Icon name={icon} color={danger ? theme.danger : iconColor ?? theme.secondary} size={21} />
    <Text style={[styles.propertyValue, { color: danger ? theme.danger : theme.fg }]}>{value}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  body: { marginHorizontal: -3, paddingTop: 8, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginLeft: -10, paddingTop: 4 },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '600', paddingVertical: 7, minHeight: 44 },
  description: { paddingTop: 3, paddingBottom: 10 },
  descriptionInput: { fontSize: 16, lineHeight: 23, minHeight: 44, paddingVertical: 0 }, inlineLinks: { marginBottom: 2 },
  property: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 13 },
  propertyValue: { flex: 1, fontSize: 16, lineHeight: 22 },
  section: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  sectionLine: { minHeight: 44, marginTop: 8, marginBottom: 0, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  count: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  goal: { minHeight: 56, paddingVertical: 10, borderRadius: 8 },
  goalHorizon: { fontSize: 12, lineHeight: 17, marginBottom: 2 }, goalTitle: { fontSize: 16, lineHeight: 22 },
  empty: { fontSize: 15, paddingVertical: 12 }, children: { marginHorizontal: -14 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, paddingBottom: 6 },
  swatchHit: { width: '25%', height: 44, alignItems: 'center', justifyContent: 'center' }, swatch: { width: 24, height: 24, borderRadius: 8 },
  event: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, gap: 12 }, error: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
})
