/**
 * [INPUT]: Workspace today, the current anchor, and the active locale.
 * [OUTPUT]: A calendar sheet body. iOS uses the system inline date picker; other platforms use a month grid with the same range.
 * [POS]: Onboarding start-date picker. Dates after today are rejected, matching the desktop date input.
 */
import { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { calendarWeekStart, clampAnchorDate, monthGrid, type MonthCell } from '@goalloom/local-store'
import type { LocaleId } from '@goalloom/local-store'
import type { Copy } from './copy'
import type { Scheme, Theme } from './theme'

const PICKER_LOCALE: Record<LocaleId, string> = {
  zh: 'zh-Hans', en: 'en-US', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR',
}

export function AnchorCalendar({ copy, theme, scheme, locale, today, anchor, onConfirm }: {
  copy: Copy; theme: Theme; scheme: Scheme; locale: LocaleId; today: string; anchor: string
  onConfirm: (ymd: string) => void
}) {
  const [draft, setDraft] = useState(() => clampAnchorDate(anchor, today))
  const choose = (ymd: string) => { if (ymd <= today) setDraft(ymd) }
  return <View style={styles.wrap}>
    {Platform.OS === 'ios'
      ? <IosCalendar theme={theme} scheme={scheme} locale={locale} today={today} value={draft} onSelect={choose} />
      : <MonthCalendar theme={theme} locale={locale} today={today} value={draft} onSelect={choose} />}
    <Pressable onPress={() => onConfirm(clampAnchorDate(draft, today))} style={styles.confirm}>
      <Text style={styles.confirmText}>{copy.confirm}</Text>
    </Pressable>
  </View>
}

function IosCalendar({ theme, scheme, locale, today, value, onSelect }: {
  theme: Theme; scheme: Scheme; locale: LocaleId; today: string; value: string; onSelect: (ymd: string) => void
}) {
  const selected = useMemo(() => civilDate(value), [value])
  const maximum = useMemo(() => civilDate(today, true), [today])
  return <DateTimePicker
    value={selected}
    mode="date"
    display="inline"
    locale={PICKER_LOCALE[locale]}
    maximumDate={maximum}
    themeVariant={scheme}
    accentColor={theme.fg}
    onValueChange={(_event, date) => onSelect(localYmd(date))}
    style={[styles.ios, { backgroundColor: theme.surface }]}
  />
}

function MonthCalendar({ theme, locale, today, value, onSelect }: {
  theme: Theme; locale: LocaleId; today: string; value: string; onSelect: (ymd: string) => void
}) {
  const [shown, setShown] = useState(() => value.slice(0, 7))
  const [yearText, monthText] = shown.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const cells = monthGrid(year, month, today, calendarWeekStart(locale))
  const title = new Intl.DateTimeFormat(PICKER_LOCALE[locale], { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1, 12))
  const canNext = shown < today.slice(0, 7)
  return <View>
    <View style={styles.monthNav}>
      <Pressable onPress={() => setShown(shiftMonth(year, month, -1))} hitSlop={8} style={styles.monthStep} accessibilityLabel={title}>
        <Text style={[styles.monthChevron, { color: theme.fg }]}>‹</Text>
      </Pressable>
      <Text style={[styles.monthTitle, { color: theme.fg }]}>{title}</Text>
      <Pressable onPress={() => { if (canNext) setShown(shiftMonth(year, month, 1)) }} hitSlop={8} disabled={!canNext} style={styles.monthStep}>
        <Text style={[styles.monthChevron, { color: canNext ? theme.fg : theme.faint }]}>›</Text>
      </Pressable>
    </View>
    <View style={styles.weekRow}>
      {weekdayLabels(locale).map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekday, { color: theme.secondary }]}>{label}</Text>)}
    </View>
    <View style={styles.grid}>
      {cells.map(cell => <Day key={cell.ymd} theme={theme} cell={cell} selected={cell.ymd === value} today={cell.ymd === today} onPress={() => onSelect(cell.ymd)} />)}
    </View>
  </View>
}

function Day({ theme, cell, selected, today, onPress }: {
  theme: Theme; cell: MonthCell; selected: boolean; today: boolean; onPress: () => void
}) {
  const day = Number(cell.ymd.slice(8))
  const color = selected ? theme.onAccent : !cell.allowed || !cell.inMonth ? theme.faint : theme.fg
  return <Pressable onPress={onPress} disabled={!cell.allowed} accessibilityRole="button" accessibilityState={{ selected, disabled: !cell.allowed }} style={styles.day}>
    <View style={[
      styles.mark,
      selected && { backgroundColor: theme.fg },
      today && !selected && { borderWidth: 1.5, borderColor: theme.fg },
    ]}>
      <Text style={{ color, fontSize: 16, fontWeight: selected || today ? '700' : '400' }}>{day}</Text>
    </View>
  </Pressable>
}

function weekdayLabels(locale: LocaleId): string[] {
  const format = new Intl.DateTimeFormat(PICKER_LOCALE[locale], { weekday: 'narrow' })
  const start = calendarWeekStart(locale)
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 9, 4 + start + index, 12)))
}

function shiftMonth(year: number, month: number, delta: number): string {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function civilDate(ymd: string, end = false): Date {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, end ? 23 : 12, end ? 59 : 0, end ? 59 : 0)
}

function localYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  ios: { height: 380, width: '100%' },
  confirm: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b2621' },
  confirmText: { color: '#fbf9f6', fontSize: 17, fontWeight: '600' },
  monthNav: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  monthStep: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthChevron: { fontSize: 28, lineHeight: 32, fontWeight: '300' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.285%', textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285%', height: 44, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
