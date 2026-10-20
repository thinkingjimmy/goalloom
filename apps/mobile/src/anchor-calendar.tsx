/**
 * [INPUT]: Workspace today, selected date, locale and an optional maximum date/week start.
 * [OUTPUT]: An accessible month grid; the anchor wrapper keeps its existing today limit.
 * [POS]: Shared date presentation for onboarding anchors and task deadlines; callers own saving.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { calendarMonthTitle, calendarWeekStart, catalogs, monthGrid, type MonthCell } from '@goalloom/local-store'
import type { LocaleId } from '@goalloom/local-store'
import { Icon } from './icons'
import { accentOrange, type Theme } from './theme'

const PICKER_LOCALE: Record<LocaleId, string> = {
  zh: 'zh-Hans', en: 'en-US', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR',
}

export function AnchorCalendar({ theme, locale, today, value, onSelect }: {
  theme: Theme; locale: LocaleId; today: string; value: string
  onSelect: (ymd: string) => void
}) {
  return <MonthCalendar theme={theme} locale={locale} today={today} value={value} maximum={today} onSelect={onSelect} />
}

export function MonthCalendar({ theme, locale, today, value, onSelect, maximum = null, weekStartsOn }: {
  theme: Theme; locale: LocaleId; today: string; value: string; onSelect: (ymd: string) => void
  maximum?: string | null; weekStartsOn?: 0 | 1
}) {
  const [shown, setShown] = useState(() => value.slice(0, 7))
  const [yearText, monthText] = shown.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const weekStart = weekStartsOn ?? calendarWeekStart(locale)
  const cells = monthGrid(year, month, today, weekStart).map(cell => ({ ...cell, allowed: maximum === null || cell.ymd <= maximum }))
  const title = calendarMonthTitle(year, month, locale)
  const canNext = maximum === null || shown < maximum.slice(0, 7)
  const choose = (ymd: string) => { if (maximum === null || ymd <= maximum) onSelect(ymd) }
  return <View>
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" onPress={() => setShown(shiftMonth(year, month, -1))} style={styles.monthStep} accessibilityLabel={catalogs[locale].task.previousMonth}>
        <Icon name="back" size={22} color={theme.fg} />
      </Pressable>
      <Text style={[styles.monthTitle, { color: theme.fg }]}>{title}</Text>
      <Pressable accessibilityRole="button" onPress={() => { if (canNext) setShown(shiftMonth(year, month, 1)) }} disabled={!canNext} style={styles.monthStep} accessibilityLabel={catalogs[locale].task.nextMonth}>
        <Icon name="next" size={22} color={canNext ? theme.fg : theme.faint} />
      </Pressable>
    </View>
    <View style={styles.weekRow}>
      {weekdayLabels(locale, weekStart).map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekday, { color: theme.secondary }]}>{label}</Text>)}
    </View>
    <View style={styles.grid}>
      {cells.map(cell => <Day key={cell.ymd} theme={theme} cell={cell} locale={locale} selected={cell.ymd === value} today={cell.ymd === today} onPress={() => choose(cell.ymd)} />)}
    </View>
  </View>
}

function Day({ theme, cell, locale, selected, today, onPress }: {
  theme: Theme; cell: MonthCell; locale: LocaleId; selected: boolean; today: boolean; onPress: () => void
}) {
  const day = Number(cell.ymd.slice(8))
  const color = selected ? theme.onAccent : !cell.allowed || !cell.inMonth ? theme.faint : theme.fg
  const label = new Intl.DateTimeFormat(PICKER_LOCALE[locale], { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${cell.ymd}T12:00:00Z`))
  return <Pressable onPress={onPress} disabled={!cell.allowed} accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ selected, disabled: !cell.allowed }} style={styles.day}>
    <View style={[
      styles.mark,
      selected && { backgroundColor: theme.fg },
      today && !selected && { borderWidth: 1.5, borderColor: theme.fg },
    ]}>
      <Text style={{ color, fontSize: 16, fontWeight: selected || today ? '700' : '400' }}>{day}</Text>
    </View>
    {today && <View style={[styles.todayDot, { backgroundColor: accentOrange }]} />}
  </Pressable>
}

function weekdayLabels(locale: LocaleId, weekStartsOn: 0 | 1): string[] {
  if (locale === 'zh') {
    const labels = ['日', '一', '二', '三', '四', '五', '六']
    return [...labels.slice(weekStartsOn), ...labels.slice(0, weekStartsOn)]
  }
  const format = new Intl.DateTimeFormat(PICKER_LOCALE[locale], { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 9, 4 + weekStartsOn + index, 12)))
}

function shiftMonth(year: number, month: number, delta: number): string {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  monthStep: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { width: '14.285%', textAlign: 'center', fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285%', height: 46, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayDot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 2.5 },
})
