/**
 * [INPUT]: Saved due date, workspace calendar and guarded edit/navigation callbacks.
 * [OUTPUT]: A localized in-sheet month picker with immediate selection and explicit date clearing.
 * [POS]: Task deadline route. Reuses the anchor calendar without its past-only restriction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ItemRow, LocaleId, Snapshot } from '@goalloom/local-store'
import { MonthCalendar } from '../anchor-calendar'
import type { Copy } from '../copy'
import type { Theme } from '../theme'
import type { Sheet } from '../view'

export function TaskDeadline({ item, snap, copy, theme, locale, onEdit, onSheet }: {
  item: ItemRow; snap: Snapshot; copy: Copy; theme: Theme; locale: LocaleId
  onEdit: (id: string, fields: { dueDate?: string | null }) => boolean; onSheet: (sheet: Sheet) => void
}) {
  const [failed, setFailed] = useState(false)
  const save = (date: string | null) => {
    if (date === item.dueDate || onEdit(item.id, { dueDate: date })) onSheet({ kind: 'detail', id: item.id })
    else setFailed(true)
  }
  return <View testID="task-deadline-calendar" style={{ marginHorizontal: -12 }}>
    <MonthCalendar theme={theme} locale={locale} today={snap.today} value={item.dueDate ?? snap.today}
      weekStartsOn={snap.calendar?.weekStart === 0 ? 0 : 1} onSelect={save} />
    <Pressable accessibilityRole="button" onPress={() => save(snap.today)} style={[styles.row, { borderColor: theme.line }]}><Text style={{ color: theme.fg }}>{copy.day}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => save(null)} style={styles.row}><Text style={{ color: theme.secondary }}>{copy.start.clear}</Text></Pressable>
    {failed && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{copy.conflict}</Text>}
  </View>
}

const styles = StyleSheet.create({ row: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth } })
