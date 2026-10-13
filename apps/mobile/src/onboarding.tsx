/**
 * [INPUT]: Locale copy, the device clock, and an explicit confirm callback.
 * [OUTPUT]: Choice, calendar, direction, and optional AI screens. Password screens render but do not call sync.
 * [POS]: First-run UI. Calendar lock and the year item happen only in onConfirm, after the AI step.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator, Image, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  calendarAnchorVisible, filterTimeZones, friendlyZoneName, pinCurrentZone, readTimeZones, runtimeZoneName, syncPasswordReady, workspaceDate, zoneLocalizedNames,
} from '@goalloom/local-store'
import type { Copy } from './copy'
import type { LocaleId } from '@goalloom/local-store'
import { Icon } from './icons'
import type { Scheme, Theme } from './theme'
import { themeFor } from './theme'
import appIcon from '../assets/icon.png'

const INK = '#2b2621'
const INK_TEXT = '#fbf9f6'

type Step = 'choice' | 'calendar' | 'direction' | 'ai' | 'join' | 'create-password'
type Picker = 'anchor' | 'zone' | 'week' | null

export function Onboarding({ copy, scheme, locale, now, onConfirm }: {
  copy: Copy; scheme: Scheme; locale: LocaleId; now: string
  onConfirm: (input: { mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchor: string; direction: string }) => void
}) {
  const theme = themeFor(scheme)
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [step, setStep] = useState<Step>('choice')
  const [waiting, setWaiting] = useState(false)
  const [mode, setMode] = useState<'rolling' | 'natural'>('rolling')
  const [timezone, setTimezone] = useState(detected)
  const [weekStart, setWeekStart] = useState(1)
  const [anchor, setAnchor] = useState(() => workspaceDate(detected, now))
  const [direction, setDirection] = useState('')
  const [picker, setPicker] = useState<Picker>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [email] = useState<string | null>(null)
  const today = workspaceDate(timezone, now)
  useEffect(() => { if (anchor > today) setAnchor(today) }, [anchor, today])
  const back = step === 'calendar' ? () => setStep('choice')
    : step === 'direction' ? () => setStep('calendar')
    : step === 'ai' ? () => setStep('direction')
    : step === 'join' ? () => { setResetOpen(false); setStep('choice') }
    : step === 'create-password' ? () => setStep('join')
    : null
  const finish = () => onConfirm({ mode, timezone, weekStart, anchor, direction })
  return <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    {step === 'choice' && <Choice copy={copy} theme={theme} waiting={waiting} onLocal={() => { setWaiting(false); setStep('calendar') }} onGoogle={() => setWaiting(true)} onCancel={() => setWaiting(false)} />}
    {step === 'calendar' && <Calendar copy={copy} theme={theme} locale={locale} mode={mode} timezone={timezone} weekStart={weekStart} anchor={anchor} today={today} onBack={back!} onMode={setMode} onOpen={setPicker} onNext={() => setStep('direction')} />}
    {step === 'direction' && <Direction copy={copy} theme={theme} value={direction} onChange={setDirection} onBack={back!} onNext={() => setStep('ai')} />}
    {step === 'ai' && <Ai copy={copy} theme={theme} onBack={back!} onDone={finish} />}
    {step === 'join' && <JoinPassword copy={copy} theme={theme} email={email} onBack={back!} onReset={() => setResetOpen(true)} />}
    {step === 'create-password' && <NewPassword copy={copy} theme={theme} email={email} onBack={back!} />}
    {picker && <PickerSheet copy={copy} theme={theme} locale={locale} kind={picker} today={today} anchor={anchor} timezone={timezone} weekStart={weekStart} onClose={() => setPicker(null)} onAnchor={setAnchor} onZone={setTimezone} onWeek={setWeekStart} />}
    {resetOpen && <ResetSheet copy={copy} theme={theme} onCancel={() => setResetOpen(false)} onConfirm={() => { setResetOpen(false); setStep('create-password') }} />}
  </View>
}

function Screen({ theme, title, intro, onBack, backLabel, lead, right, cta, children }: {
  theme: Theme; title?: string; intro?: ReactNode; onBack?: (() => void) | null; backLabel?: string
  lead?: ReactNode; right?: ReactNode; cta?: ReactNode; children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const showNav = !!onBack || !!right
  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ paddingTop: Platform.OS === 'web' ? 12 : insets.top }}>
      {showNav && <View style={styles.nav}>
        {onBack ? <Pressable onPress={onBack} hitSlop={8} style={styles.back} accessibilityLabel={backLabel}><Text style={[styles.chevron, { color: theme.fg }]}>‹</Text></Pressable> : <View style={styles.back} />}
        {lead}
        <View style={styles.fill} />
        {right}
      </View>}
    </View>
    {onBack && <EdgeBack onBack={onBack} />}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, !showNav && { paddingTop: 8 }]}>
      {intro}
      {!!title && <Text style={[styles.title, { color: theme.fg }]}>{title}</Text>}
      {children}
    </ScrollView>
    {cta && <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>{cta}</View>}
  </KeyboardAvoidingView>
}

function EdgeBack({ onBack }: { onBack: () => void }) {
  const back = useRef(onBack)
  back.current = onBack
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dx > 12 && gesture.dx > Math.abs(gesture.dy),
    onPanResponderRelease: (_event, gesture) => { if (gesture.dx > 72 && gesture.vx > 0.2) back.current() },
  })).current
  return <View style={styles.edge} {...pan.panHandlers} />
}

function Primary({ label, disabled, danger, onPress }: { label: string; disabled?: boolean; danger?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, danger && styles.danger, disabled && styles.disabled]}>
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
}

function Choice({ copy, theme, waiting, onLocal, onGoogle, onCancel }: {
  copy: Copy; theme: Theme; waiting: boolean; onLocal: () => void; onGoogle: () => void; onCancel: () => void
}) {
  const s = copy.start
  return <Screen theme={theme} intro={<View style={styles.welcomeRow}>
    <Image source={appIcon} style={styles.mark} />
    <Text style={[styles.welcome, { color: theme.secondary }]}>{s.welcome}</Text>
  </View>} title={s.title}>
    <View style={styles.stack}>
      <Pressable disabled={waiting} onPress={onLocal} style={[styles.card, { backgroundColor: theme.raised, borderColor: theme.line }, waiting && styles.dimmed]}>
        <Icon name="phone" size={22} color={theme.fg} />
        <Text style={[styles.cardTitle, { color: theme.fg }]}>{s.local}</Text>
        <Text style={[styles.cardNote, { color: theme.secondary }]}>{s.localNote}</Text>
      </Pressable>
      {waiting ? <View style={[styles.card, { backgroundColor: theme.raised, borderColor: INK }]}>
        <IconRow theme={theme} title={s.google} />
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <View style={styles.waitRow}>
          <ActivityIndicator color={theme.fg} />
          <Text style={[styles.cardNote, styles.fill, { color: theme.fg }]}>{s.browser}</Text>
          <Pressable onPress={onCancel} hitSlop={8}><Text style={[styles.link, { color: theme.focus }]}>{s.back}</Text></Pressable>
        </View>
      </View> : <Pressable onPress={onGoogle} style={[styles.card, { backgroundColor: theme.raised, borderColor: theme.line }]}>
        <IconRow theme={theme} title={s.google} />
        <Text style={[styles.cardNote, { color: theme.secondary }]}>{s.googleNote}</Text>
      </Pressable>}
    </View>
  </Screen>
}

function IconRow({ theme, title }: { theme: Theme; title: string }) {
  return <View style={styles.iconRow}><GoogleMark /><Text style={[styles.cardTitle, { color: theme.fg }]}>{title}</Text></View>
}

function GoogleMark() {
  return <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
}

function Calendar({ copy, theme, locale, mode, timezone, weekStart, anchor, today, onBack, onMode, onOpen, onNext }: {
  copy: Copy; theme: Theme; locale: LocaleId; mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchor: string; today: string
  onBack: () => void; onMode: (mode: 'rolling' | 'natural') => void; onOpen: (picker: Picker) => void; onNext: () => void
}) {
  const s = copy.start
  const anchorValue = showDate(copy, today, anchor)
  return <Screen theme={theme} title={s.calendarTitle} onBack={onBack} backLabel={s.back} cta={<Primary label={s.next} onPress={onNext} />}>
    <View style={styles.stack}>
      <ModeRow theme={theme} selected={mode === 'rolling'} title={s.rolling} body={s.rollingBody} tag={s.defaultTag} onPress={() => onMode('rolling')} />
      <ModeRow theme={theme} selected={mode === 'natural'} title={s.natural} body={s.naturalBody} onPress={() => onMode('natural')} />
    </View>
    <View style={[styles.group, { backgroundColor: theme.raised }]}>
      {calendarAnchorVisible(mode) && <GroupRow theme={theme} label={s.anchor} value={anchorValue} onPress={() => onOpen('anchor')} />}
      {calendarAnchorVisible(mode) && <View style={[styles.hairline, { backgroundColor: theme.line }]} />}
      <GroupRow theme={theme} label={s.timezone} value={friendlyZoneName(timezone, locale)} onPress={() => onOpen('zone')} />
      <View style={[styles.hairline, { backgroundColor: theme.line }]} />
      <GroupRow theme={theme} label={s.weekFrom} value={s.weekdays[weekStart - 1] ?? s.weekdays[0]!} onPress={() => onOpen('week')} />
    </View>
    <Text style={[styles.footer, { color: theme.secondary }]}>{s.lockFoot}</Text>
  </Screen>
}

function ModeRow({ theme, selected, title, body, tag, onPress }: {
  theme: Theme; selected: boolean; title: string; body: string; tag?: string; onPress: () => void
}) {
  return <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.raised, borderColor: selected ? INK : theme.line }]}>
    <View style={styles.modeTitle}>
      <Text style={[styles.cardTitle, { color: theme.fg }]}>{title}</Text>
      {!!tag && <Text style={[styles.tag, { color: theme.secondary, backgroundColor: theme.hover }]}>{tag}</Text>}
    </View>
    <Text style={[styles.cardNote, { color: theme.secondary }]}>{body}</Text>
  </Pressable>
}

function GroupRow({ theme, label, value, onPress }: { theme: Theme; label: string; value: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.groupRow}>
    <Text style={[styles.groupLabel, { color: theme.fg }]}>{label}</Text>
    <Text numberOfLines={1} style={[styles.groupValue, { color: theme.secondary }]}>{value}</Text>
    <Text style={[styles.groupChevron, { color: theme.faint }]}>›</Text>
  </Pressable>
}

function Direction({ copy, theme, value, onChange, onBack, onNext }: {
  copy: Copy; theme: Theme; value: string; onChange: (value: string) => void; onBack: () => void; onNext: () => void
}) {
  const s = copy.start
  return <Screen theme={theme} title={s.directionTitle} onBack={onBack} backLabel={s.back} cta={<Primary label={s.confirmStart} onPress={onNext} />}>
    <TextInput value={value} onChangeText={onChange} multiline style={[styles.field, styles.direction, { color: theme.fg, backgroundColor: theme.raised, borderColor: theme.line }]} />
    <View style={styles.chips}>
      {s.examples.map(example => <Pressable key={example} onPress={() => onChange(example)} style={[styles.chip, { backgroundColor: theme.hover }]}>
        <Text style={{ color: theme.fg, fontSize: 14 }}>{example}</Text>
      </Pressable>)}
    </View>
  </Screen>
}

function Ai({ copy, theme, onBack, onDone }: { copy: Copy; theme: Theme; onBack: () => void; onDone: () => void }) {
  const s = copy.start
  return <Screen theme={theme} title={s.aiTitle} onBack={onBack} backLabel={s.back} right={<Pressable onPress={onDone} hitSlop={8} style={styles.skip}><Text style={[styles.link, { color: theme.fg }]}>{s.skip}</Text></Pressable>} cta={<Primary label={s.aiConnect} onPress={onDone} />}>
    <View style={[styles.card, { backgroundColor: theme.raised, borderColor: theme.line }]}>
      <Text style={[styles.sample, { color: theme.fg }]}>{s.aiSample}</Text>
      {s.aiItems.map(item => <View key={item} style={styles.sampleRow}>
        <View style={[styles.sampleDot, { borderColor: theme.checkEdge }]} />
        <Text style={{ color: theme.fg, fontSize: 15, flex: 1 }}>{item}</Text>
      </View>)}
    </View>
    <View style={styles.points}>
      {s.aiPoints.map((point, index) => <View key={point} style={styles.point}>
        <Text style={[styles.pointIndex, { color: theme.secondary }]}>{index + 1}</Text>
        <Text style={[styles.pointText, { color: theme.fg }]}>{point}</Text>
      </View>)}
    </View>
  </Screen>
}

function JoinPassword({ copy, theme, email, onBack, onReset }: {
  copy: Copy; theme: Theme; email: string | null; onBack: () => void; onReset: () => void
}) {
  const s = copy.start
  const [password, setPassword] = useState('')
  return <Screen theme={theme} title={s.enterTitle} onBack={onBack} backLabel={s.back} lead={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary label={s.startSync} disabled={password.trim().length < 8} onPress={() => undefined} />}>
    <View style={styles.labelRow}>
      <View style={styles.fill} />
      <Pressable onPress={onReset} hitSlop={8}><Text style={[styles.link, { color: theme.focus }]}>{s.resetSync}</Text></Pressable>
    </View>
    <Secret copy={copy} theme={theme} value={password} onChange={setPassword} label={s.enterTitle} />
  </Screen>
}

function NewPassword({ copy, theme, email, onBack }: { copy: Copy; theme: Theme; email: string | null; onBack: () => void }) {
  const s = copy.start
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const ready = syncPasswordReady(password, again)
  const longEnough = password.trim().length >= 8
  const mismatch = again.length > 0 && password.trim() !== again.trim()
  return <Screen theme={theme} title={s.newTitle} onBack={onBack} backLabel={s.back} lead={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary label={s.continue} disabled={!ready} onPress={() => undefined} />}>
    <Text style={[styles.cardNote, { color: theme.secondary, marginBottom: 12 }]}>{s.newNote}</Text>
    <Secret copy={copy} theme={theme} value={password} onChange={setPassword} label={s.newTitle} />
    <View style={styles.rule}>
      <Text style={{ color: longEnough ? theme.fg : theme.faint }}>{longEnough ? '✓ ' : ''}{s.passwordRule}</Text>
    </View>
    <Text style={[styles.fieldLabel, { color: theme.secondary }]}>{s.confirmPassword}</Text>
    <Secret copy={copy} theme={theme} value={again} onChange={setAgain} label={s.confirmPassword} />
    {mismatch && <Text style={[styles.cardNote, { color: theme.danger, marginTop: 8 }]}>{s.mismatch}</Text>}
  </Screen>
}

function Secret({ copy, theme, value, onChange, label }: { copy: Copy; theme: Theme; value: string; onChange: (value: string) => void; label: string }) {
  const [shown, setShown] = useState(false)
  return <View style={[styles.secret, { backgroundColor: theme.raised, borderColor: theme.line }]}>
    <TextInput value={value} onChangeText={onChange} secureTextEntry={!shown} autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} style={[styles.secretInput, { color: theme.fg }]} />
    <Pressable onPress={() => setShown(current => !current)} hitSlop={8} accessibilityLabel={shown ? copy.start.hidePassword : copy.start.showPassword}>
      <Icon name={shown ? 'eyeOff' : 'eye'} size={20} color={theme.secondary} />
    </Pressable>
  </View>
}

function EmailChip({ theme, email }: { theme: Theme; email: string }) {
  const letter = email.trim().charAt(0).toUpperCase() || '?'
  return <View style={[styles.chip, styles.email, { backgroundColor: theme.hover }]}>
    <View style={[styles.avatar, { backgroundColor: theme.fg }]}><Text style={{ color: theme.onAccent, fontSize: 12, fontWeight: '600' }}>{letter}</Text></View>
    <Text numberOfLines={1} style={{ color: theme.fg, fontSize: 13, maxWidth: 180 }}>{email}</Text>
  </View>
}

function ResetSheet({ copy, theme, onCancel, onConfirm }: { copy: Copy; theme: Theme; onCancel: () => void; onConfirm: () => void }) {
  const s = copy.start
  const [ack, setAck] = useState(false)
  const insets = useSafeAreaInsets()
  return <View style={styles.sheetWrap}>
    <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onCancel} />
    <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.grab, { backgroundColor: theme.line }]} />
      <Text style={[styles.sheetTitle, { color: theme.fg }]}>{s.resetTitle}</Text>
      <Text style={[styles.cardNote, { color: theme.secondary }]}>{s.resetBody}</Text>
      <Pressable onPress={() => setAck(value => !value)} style={styles.checkRow}>
        <View style={[styles.box, { borderColor: theme.checkEdge, backgroundColor: ack ? INK : 'transparent' }]}>{ack && <Text style={styles.tick}>✓</Text>}</View>
        <Text style={[styles.pointText, { color: theme.fg }]}>{s.resetAck}</Text>
      </Pressable>
      <Primary label={s.resetConfirm} danger disabled={!ack} onPress={onConfirm} />
      <Pressable onPress={onCancel} style={styles.cancel}><Text style={[styles.link, { color: theme.fg }]}>{s.cancel}</Text></Pressable>
    </View>
  </View>
}

function PickerSheet({ copy, theme, locale, kind, today, anchor, timezone, weekStart, onClose, onAnchor, onZone, onWeek }: {
  copy: Copy; theme: Theme; locale: LocaleId; kind: Exclude<Picker, null>; today: string; anchor: string; timezone: string; weekStart: number
  onClose: () => void; onAnchor: (value: string) => void; onZone: (value: string) => void; onWeek: (value: number) => void
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const s = copy.start
  const [query, setQuery] = useState('')
  const dates = useMemo(() => pastDates(today, 420), [today])
  const zones = useMemo(() => {
    if (kind !== 'zone') return []
    const all = readTimeZones()
    return all.includes(timezone) ? all : [timezone, ...all]
  }, [kind, timezone])
  const names = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const id of zones) {
      const runtime = runtimeZoneName(id, locale)
      const localized = zoneLocalizedNames(id)
      map.set(id, runtime ? [...localized, runtime] : localized)
    }
    return map
  }, [zones, locale])
  const shown = useMemo(
    () => pinCurrentZone(filterTimeZones(zones, query, id => names.get(id) ?? []), timezone),
    [zones, query, names, timezone],
  )
  const title = kind === 'anchor' ? s.anchor : kind === 'zone' ? s.timezone : s.weekFrom
  return <View style={styles.sheetWrap}>
    <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose} />
    <View style={[styles.sheet, styles.pickerSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.grab, { backgroundColor: theme.line }]} />
      <Text style={[styles.sheetTitle, { color: theme.fg }]}>{title}</Text>
      {kind === 'zone' && <TextInput value={query} onChangeText={setQuery} placeholder={s.search} placeholderTextColor={theme.faint} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" style={[styles.field, { color: theme.fg, backgroundColor: theme.raised, borderColor: theme.line }]} />}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.round(height * 0.62) }}>
        {kind === 'anchor' && dates.map(date => <Pressable key={date} onPress={() => { onAnchor(date); onClose() }} style={styles.pickerRow}>
          <Text style={{ color: date === anchor ? theme.fg : theme.secondary, fontWeight: date === anchor ? '600' : '400', fontSize: 16 }}>{showDate(copy, today, date)}</Text>
        </Pressable>)}
        {kind === 'zone' && shown.map(id => <ZoneRow key={id} theme={theme} id={id} locale={locale} selected={id === timezone} onPress={() => { onZone(id); onClose() }} />)}
        {kind === 'week' && s.weekdays.map((name, index) => <Pressable key={name} onPress={() => { onWeek(index + 1); onClose() }} style={styles.pickerRow}>
          <Text style={{ color: index + 1 === weekStart ? theme.fg : theme.secondary, fontWeight: index + 1 === weekStart ? '600' : '400', fontSize: 16 }}>{name}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>
}

function ZoneRow({ theme, id, locale, selected, onPress }: { theme: Theme; id: string; locale: LocaleId; selected: boolean; onPress: () => void }) {
  const friendly = friendlyZoneName(id, locale)
  return <Pressable onPress={onPress} style={styles.zoneRow}>
    <View style={styles.zoneText}>
      <Text numberOfLines={1} style={{ color: selected ? theme.fg : theme.secondary, fontWeight: selected ? '600' : '400', fontSize: 16 }}>{friendly}</Text>
      {friendly !== id && <Text numberOfLines={1} style={{ color: theme.faint, fontSize: 13 }}>{id}</Text>}
    </View>
    {selected && <Icon name="check" size={18} color={theme.fg} />}
  </Pressable>
}

function showDate(copy: Copy, today: string, ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const chip = copy.start.monthDay(month ?? 1, day ?? 1)
  if (ymd === today) return copy.start.anchorToday(chip)
  if (String(year) !== today.slice(0, 4)) return `${year} · ${chip}`
  return chip
}

function pastDates(today: string, count: number): string[] {
  const list = [today]
  let cursor = today
  for (let index = 0; index < count; index += 1) {
    cursor = shiftDay(cursor, -1)
    list.push(cursor)
  }
  return list
}

function shiftDay(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  const monthText = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dayText = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${monthText}-${dayText}`
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chevron: { fontSize: 34, lineHeight: 38, fontWeight: '300', marginTop: -2 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 4 },
  body: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.4, textAlign: 'left', marginBottom: 20 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  mark: { width: 28, height: 28, borderRadius: 7 },
  welcome: { fontSize: 15 },
  stack: { gap: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardNote: { fontSize: 14, lineHeight: 20 },
  dimmed: { opacity: 0.38 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { fontSize: 16 },
  modeTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { fontSize: 12, fontWeight: '600', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  group: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  groupRow: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupLabel: { fontSize: 16, flex: 1 },
  groupValue: { fontSize: 16, maxWidth: '58%' },
  groupChevron: { fontSize: 20, marginTop: -1 },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footer: { fontSize: 13, lineHeight: 18, marginTop: 8, marginHorizontal: 16 },
  ctaBar: { paddingHorizontal: 20, paddingTop: 8 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: INK },
  danger: { backgroundColor: '#b4382f' },
  disabled: { opacity: 0.38 },
  primaryText: { color: INK_TEXT, fontSize: 17, fontWeight: '600' },
  field: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 },
  direction: { minHeight: 96, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  sample: { fontSize: 15, lineHeight: 22 },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  sampleDot: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5 },
  points: { marginTop: 18, gap: 12 },
  point: { flexDirection: 'row', gap: 10 },
  pointIndex: { width: 18, fontSize: 15, fontWeight: '600' },
  pointText: { flex: 1, fontSize: 16, lineHeight: 22 },
  skip: { height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  labelRow: { flexDirection: 'row', marginBottom: 8 },
  fieldLabel: { fontSize: 13, marginTop: 16, marginBottom: 8 },
  secret: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingLeft: 14, paddingRight: 12, flexDirection: 'row', alignItems: 'center' },
  secretInput: { flex: 1, fontSize: 17, paddingVertical: 12 },
  rule: { marginTop: 8 },
  email: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  pickerSheet: { maxHeight: '78%' },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { color: INK_TEXT, fontSize: 14, fontWeight: '700' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerRow: { minHeight: 48, justifyContent: 'center' },
  zoneRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneText: { flex: 1 },
})
