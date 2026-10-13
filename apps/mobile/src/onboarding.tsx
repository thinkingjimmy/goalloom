/**
 * [INPUT]: Locale copy, the device clock, and an explicit confirm callback.
 * [OUTPUT]: Choice, calendar, direction, and the optional AI connect screen. Password screens render but do not call sync.
 * [POS]: First-run UI. Calendar lock and the year item happen only in onConfirm, after the AI step.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  calendarAnchorVisible, filterTimeZones, friendlyZoneName, pinCurrentZone, readTimeZones, runtimeZoneName, signInButtons, syncPasswordReady, workspaceDate, zoneLocalizedNames,
} from '@goalloom/local-store'
import type { AiConnection, SignInProvider } from '@goalloom/local-store'
import { AiConnect } from './ai-connect'
import { SetupScreen as Screen } from './setup-screen'
import type { Copy } from './copy'
import type { LocaleId } from '@goalloom/local-store'
import { Icon } from './icons'
import type { Scheme, Theme } from './theme'
import { themeFor } from './theme'
import { AnchorCalendar } from './anchor-calendar'

const INK = '#2b2621'
const INK_TEXT = '#fbf9f6'

type Step = 'choice' | 'calendar' | 'direction' | 'ai' | 'join' | 'create-password'
type Picker = 'anchor' | 'zone' | 'week' | null

export function Onboarding({ copy, scheme, locale, now, ai, onAi, onConfirm }: {
  copy: Copy; scheme: Scheme; locale: LocaleId; now: string
  ai: AiConnection | null
  onAi: (next: AiConnection | null) => void
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
    {step === 'ai' && <AiConnect copy={copy} theme={theme} connection={ai} onConnection={onAi} onBack={back!} onDone={finish} />}
    {step === 'join' && <JoinPassword copy={copy} theme={theme} email={email} onBack={back!} onReset={() => setResetOpen(true)} />}
    {step === 'create-password' && <NewPassword copy={copy} theme={theme} email={email} onBack={back!} />}
    {picker && <PickerSheet copy={copy} theme={theme} scheme={scheme} locale={locale} kind={picker} today={today} anchor={anchor} timezone={timezone} weekStart={weekStart} onClose={() => setPicker(null)} onAnchor={setAnchor} onZone={setTimezone} onWeek={setWeekStart} />}
    {resetOpen && <ResetSheet copy={copy} theme={theme} onCancel={() => setResetOpen(false)} onConfirm={() => { setResetOpen(false); setStep('create-password') }} />}
  </View>
}

function Primary({ label, disabled, danger, onPress }: { label: string; disabled?: boolean; danger?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, danger && styles.danger, disabled && styles.disabled]}>
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
}

const BENEFIT_ICONS = ['sync', 'phone'] as const
/** Apple is omitted until sign-in exists. `signInButtons` still places it above Google. */
const SIGN_IN_ENABLED = ['google'] as const satisfies readonly SignInProvider[]

function Choice({ copy, theme, waiting, onLocal, onGoogle, onCancel }: {
  copy: Copy; theme: Theme; waiting: boolean; onLocal: () => void; onGoogle: () => void; onCancel: () => void
}) {
  const s = copy.start
  return <Screen theme={theme} title={s.title} cta={<View style={styles.authStack}>
    {signInButtons(SIGN_IN_ENABLED).map(id => id === 'apple'
      ? <AppleButton key={id} label={s.apple} />
      : <GoogleButton key={id} label={s.google} waiting={waiting} browser={s.browser} back={s.back} focus={theme.focus} onPress={onGoogle} onCancel={onCancel} />)}
    <OrDivider label={s.or} color={theme.secondary} line={theme.line} />
    <Pressable disabled={waiting} onPress={onLocal} style={[styles.authButton, { backgroundColor: theme.checkFill }, waiting && styles.dimmed]}>
      <View style={styles.slot}><Icon name="phone" size={20} color={theme.fg} /></View>
      <Text style={[styles.authLabel, { color: theme.fg }]}>{s.local}</Text>
    </Pressable>
  </View>}>
    <View style={styles.benefits}>
      {s.benefits.map((line, index) => <View key={line.lead} style={styles.benefit}>
        <View style={styles.benefitIcon}><Icon name={BENEFIT_ICONS[index] ?? 'info'} size={20} color={theme.fg} /></View>
        <View style={styles.benefitCopy}>
          <Text style={[styles.benefitLead, { color: theme.fg }]}>{line.lead}</Text>
          <Text style={[styles.benefitBody, { color: theme.secondary }]}>{line.body}</Text>
        </View>
      </View>)}
    </View>
  </Screen>
}

function AppleButton({ label }: { label: string }) {
  return <Pressable style={[styles.authButton, styles.appleButton]}>
    <View style={styles.slot}><Icon name="apple" size={20} color="#fff" /></View>
    <Text style={[styles.authLabel, styles.appleLabel]}>{label}</Text>
  </Pressable>
}

function GoogleButton({ label, waiting, browser, back, focus, onPress, onCancel }: {
  label: string; waiting: boolean; browser: string; back: string; focus: string; onPress: () => void; onCancel: () => void
}) {
  if (waiting) return <View style={[styles.authButton, styles.googleButton]}>
    <View style={styles.slot}><ActivityIndicator color="#1f1f1f" /></View>
    <Text style={[styles.authLabel, styles.googleLabel, styles.authLabelWait]}>{browser}</Text>
    <Pressable onPress={onCancel} hitSlop={8}><Text style={[styles.link, { color: focus }]}>{back}</Text></Pressable>
  </View>
  return <Pressable onPress={onPress} style={[styles.authButton, styles.googleButton]}>
    <View style={styles.slot}><GoogleMark /></View>
    <Text style={[styles.authLabel, styles.googleLabel]}>{label}</Text>
  </Pressable>
}

function OrDivider({ label, color, line }: { label: string; color: string; line: string }) {
  return <View style={styles.orRow}>
    <View style={[styles.orLine, { backgroundColor: line }]} />
    <Text style={[styles.orText, { color }]}>{label}</Text>
    <View style={[styles.orLine, { backgroundColor: line }]} />
  </View>
}

function GoogleMark() {
  return <Svg width={18} height={18} viewBox="0 0 48 48">
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

function JoinPassword({ copy, theme, email, onBack, onReset }: {
  copy: Copy; theme: Theme; email: string | null; onBack: () => void; onReset: () => void
}) {
  const s = copy.start
  const [password, setPassword] = useState('')
  return <Screen theme={theme} title={s.enterTitle} onBack={onBack} backLabel={s.back} extra={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary label={s.startSync} disabled={password.trim().length < 8} onPress={() => undefined} />}>
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
  return <Screen theme={theme} title={s.newTitle} onBack={onBack} backLabel={s.back} extra={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary label={s.continue} disabled={!ready} onPress={() => undefined} />}>
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

function PickerSheet({ copy, theme, scheme, locale, kind, today, anchor, timezone, weekStart, onClose, onAnchor, onZone, onWeek }: {
  copy: Copy; theme: Theme; scheme: Scheme; locale: LocaleId; kind: Exclude<Picker, null>; today: string; anchor: string; timezone: string; weekStart: number
  onClose: () => void; onAnchor: (value: string) => void; onZone: (value: string) => void; onWeek: (value: number) => void
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const s = copy.start
  const [query, setQuery] = useState('')
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
    <View style={[styles.sheet, styles.pickerSheet, kind === 'anchor' && { maxHeight: '94%' }, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.grab, { backgroundColor: theme.line }]} />
      <Text style={[styles.sheetTitle, { color: theme.fg }]}>{title}</Text>
      {kind === 'zone' && <TextInput value={query} onChangeText={setQuery} placeholder={s.search} placeholderTextColor={theme.faint} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" style={[styles.field, { color: theme.fg, backgroundColor: theme.raised, borderColor: theme.line }]} />}
      {kind === 'anchor' && <AnchorCalendar copy={copy} theme={theme} scheme={scheme} locale={locale} today={today} anchor={anchor} onConfirm={ymd => { onAnchor(ymd); onClose() }} />}
      {kind !== 'anchor' && <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.round(height * 0.62) }}>
        {kind === 'zone' && shown.map(id => <ZoneRow key={id} theme={theme} id={id} locale={locale} selected={id === timezone} onPress={() => { onZone(id); onClose() }} />)}
        {kind === 'week' && s.weekdays.map((name, index) => <Pressable key={name} onPress={() => { onWeek(index + 1); onClose() }} style={styles.pickerRow}>
          <Text style={{ color: index + 1 === weekStart ? theme.fg : theme.secondary, fontWeight: index + 1 === weekStart ? '600' : '400', fontSize: 16 }}>{name}</Text>
        </Pressable>)}
      </ScrollView>}
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  benefits: { gap: 20 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitIcon: { width: 28, height: 22, alignItems: 'center', justifyContent: 'center' },
  benefitCopy: { flex: 1 },
  benefitLead: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  benefitBody: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  authStack: { gap: 12 },
  authButton: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  googleButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0' },
  appleButton: { backgroundColor: '#000' },
  slot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  authLabel: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', marginRight: 24 },
  authLabelWait: { marginRight: 0 },
  googleLabel: { color: '#1f1f1f' },
  appleLabel: { color: '#fff' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 14 },
  stack: { gap: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardNote: { fontSize: 14, lineHeight: 20 },
  dimmed: { opacity: 0.38 },
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
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: INK },
  danger: { backgroundColor: '#b4382f' },
  disabled: { opacity: 0.38 },
  primaryText: { color: INK_TEXT, fontSize: 17, fontWeight: '600' },
  field: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 },
  direction: { minHeight: 96, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  pointText: { flex: 1, fontSize: 16, lineHeight: 22 },
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
