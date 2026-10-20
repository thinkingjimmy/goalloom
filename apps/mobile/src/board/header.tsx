/**
 * [INPUT]: Visible horizons, workspace periods, saved tasks and localized appearance.
 * [OUTPUT]: A stacked board heading and accessible bottom-sheet horizon choices.
 * [POS]: Board navigation presentation; selection changes the viewport, never task placement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { columnRange, currentPeriod, precedingPeriod, type CalendarConfig, type Horizon, type LocaleId, type Period, type PeriodHorizon, type Snapshot } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { Icon } from '../icons'
import type { Theme } from '../theme'

type Periods = Partial<Record<PeriodHorizon, Period>>

export function BoardHeader({ copy, theme, locale, horizon, period, calendar, today, current, onOpen }: {
  copy: Copy; theme: Theme; locale: LocaleId; horizon: Horizon; period: Period | null
  calendar: CalendarConfig | null; today: string; current: Period | null; onOpen: () => void
}) {
  const label = periodLabel(copy, locale, horizon, period, calendar, today, current)
  return <View testID="board-header" style={styles.header}>
    <Pressable testID="board-horizon-trigger" accessibilityRole="button" accessibilityLabel={`${copy.task.chooseHorizon}: ${label.title}`} onPress={onOpen} style={styles.trigger}>
      <Text style={[styles.title, { color: theme.fg }]}>{label.title}</Text>
      <Icon name="down" size={18} color={theme.secondary} />
    </Pressable>
    {!!label.range && <Text testID="board-date-range" style={[styles.subtitle, { color: theme.secondary }]}>{label.range}</Text>}
  </View>
}

export function BoardHorizonOptions({ copy, theme, locale, snap, columns, horizon, viewed, onPick }: {
  copy: Copy; theme: Theme; locale: LocaleId; snap: Snapshot; columns: readonly Horizon[]
  horizon: Horizon; viewed: Periods; onPick: (horizon: Horizon) => void
}) {
  return <View testID="board-horizon-options" accessibilityRole="radiogroup" accessibilityLabel={copy.task.chooseHorizon}>
    {columns.map(page => {
      const period = page === 'later' ? null : viewed[page] ?? snap.periods[page] ?? null
      const label = periodLabel(copy, locale, page, period, snap.calendar, snap.today, page === 'later' ? null : snap.periods[page] ?? null)
      const selected = page === horizon
      const count = snap.items.filter(item => item.horizon === page && (page === 'later' || item.periodId === period?.id) && item.status === 'todo').length
      return <Pressable key={page} testID={`board-horizon-${page}`} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
        accessibilityLabel={[label.title, label.range, copy.itemCount(count)].filter(Boolean).join(' · ')}
        onPress={() => onPick(page)} style={({ pressed }) => [styles.option, { borderBottomColor: theme.hairline, backgroundColor: pressed ? theme.hover : 'transparent' }]}>
        <View style={styles.optionCopy}>
          <Text style={[styles.optionTitle, { color: theme.fg, fontWeight: selected ? '600' : '400' }]}>{label.title}</Text>
          {!!label.range && <Text style={[styles.optionRange, { color: theme.secondary }]}>{label.range}</Text>}
        </View>
        <View style={styles.mark}>{selected ? <Icon name="check" size={20} color={theme.focus} /> : <Text style={[styles.count, { color: theme.secondary }]}>{count}</Text>}</View>
      </Pressable>
    })}
  </View>
}

function periodLabel(copy: Copy, locale: LocaleId, horizon: Horizon, period: Period | null, calendar: CalendarConfig | null, today: string, current: Period | null): { title: string; range: string } {
  if (horizon === 'later' || !period) return { title: copy.later, range: '' }
  const title = horizon === 'year' ? period.startDate.slice(0, 4) : copy[horizon]
  let relative = true
  if (calendar && current?.startAt && current.endAt && period.id !== current.id) {
    if (horizon === 'cycle' && calendar.mode !== 'natural') relative = false
    else {
      try { relative = precedingPeriod(calendar, current)?.id === period.id || currentPeriod(calendar, horizon, current.endAt).id === period.id }
      catch { relative = false }
    }
  }
  return { title, range: columnRange(horizon, period, calendar, today, locale, relative) }
}

const styles = StyleSheet.create({
  header: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 24, alignItems: 'flex-start' },
  trigger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  title: { flexShrink: 1, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 7 },
  option: { minHeight: 56, paddingVertical: 12, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  optionCopy: { flex: 1, minWidth: 0 }, optionTitle: { fontSize: 17, lineHeight: 23 }, optionRange: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  mark: { minWidth: 28, alignItems: 'flex-end' }, count: { fontSize: 15, fontVariant: ['tabular-nums'] },
})
