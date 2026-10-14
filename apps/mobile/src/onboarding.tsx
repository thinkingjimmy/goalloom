/**
 * [INPUT]: Locale copy, the device clock, and an explicit confirm callback.
 * [OUTPUT]: Choice, calendar, and direction. Password screens render but do not call sync.
 * [POS]: First-run UI. Calendar lock and the year item happen only in onConfirm, when the direction step continues.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  ActivityIndicator, Alert, Animated, Easing, Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type KeyboardEvent, type StyleProp, type ViewStyle,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import {
  calendarAnchorVisible, clampAnchorDate, friendlyZoneName, highlightSpans, keyboardDuration, keyboardFrameTop, readTimeZones, runtimeZoneName, signInButtons,
  sheetRelease, shouldDragSheet, suggestionShift, syncPasswordReady, timeZonePickerList, workspaceDate, zoneLocalizedNames, zoneOffsetLabel, zoneOffsetMinutes,
} from '@goalloom/local-store'
import type { SignInProvider } from '@goalloom/local-store'
import { applyContinueReturnKey } from 'continue-return-key'
import { SetupScreen as Screen } from './setup-screen'
import type { Copy } from './copy'
import type { LocaleId } from '@goalloom/local-store'
import { Icon } from './icons'
import { accentOrange, type Scheme, type Theme } from './theme'
import { themeFor } from './theme'
import { AnchorCalendar } from './anchor-calendar'

type Step = 'choice' | 'calendar' | 'direction' | 'join' | 'create-password'
type Picker = 'anchor' | 'zone' | null
type GooglePhase = 'idle' | 'pending' | 'failed'
interface WeekAnchor { x: number; y: number; width: number; height: number }

const SheetScrollY = createContext<RefObject<number> | null>(null)

export function Onboarding({ copy, scheme, locale, now, onConfirm }: {
  copy: Copy; scheme: Scheme; locale: LocaleId; now: string
  onConfirm: (input: { mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchor: string; direction: string }) => void
}) {
  const theme = themeFor(scheme)
  const { height } = useWindowDimensions()
  const titleGap = Math.round(height / 6)
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [step, setStep] = useState<Step>('choice')
  const [google, setGoogle] = useState<GooglePhase>('idle')
  const [mode, setMode] = useState<'rolling' | 'natural'>('rolling')
  const [timezone, setTimezone] = useState(detected)
  const [weekStart, setWeekStart] = useState(1)
  const [anchor, setAnchor] = useState(() => workspaceDate(detected, now))
  const [direction, setDirection] = useState('')
  const [picker, setPicker] = useState<Picker>(null)
  const [weekOpen, setWeekOpen] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState<WeekAnchor>({ x: 0, y: 280, width: 200, height: 48 })
  const today = workspaceDate(timezone, now)
  useEffect(() => { if (anchor > today) setAnchor(today) }, [anchor, today])
  const back = step === 'calendar' ? () => setStep('choice')
    : step === 'direction' ? () => setStep('calendar')
    : step === 'join' ? () => setStep('choice')
    : step === 'create-password' ? () => setStep('join')
    : null
  const finish = () => onConfirm({ mode, timezone, weekStart, anchor, direction })
  const askReset = () => {
    const s = copy.start
    Alert.alert(s.resetTitle, s.resetBody, [
      { text: s.cancel, style: 'cancel' },
      { text: s.resetAction, style: 'destructive', onPress: () => setStep('create-password') },
    ])
  }
  return <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    {step === 'choice' && <Choice copy={copy} theme={theme} titleGap={titleGap} google={google} onLocal={() => { setGoogle('idle'); setStep('calendar') }} onGoogle={() => setGoogle('pending')} onCancel={() => setGoogle('failed')} />}
    {step === 'calendar' && <Calendar copy={copy} theme={theme} locale={locale} titleGap={titleGap} mode={mode} timezone={timezone} weekStart={weekStart} anchor={anchor} today={today} onBack={back!} onMode={setMode} onOpen={setPicker} onWeekMenu={rect => { setWeekAnchor(rect); setWeekOpen(true) }} onNext={() => setStep('direction')} />}
    {step === 'direction' && <Direction copy={copy} theme={theme} titleGap={titleGap} value={direction} onChange={setDirection} onBack={back!} onNext={finish} />}
    {step === 'join' && <JoinPassword copy={copy} theme={theme} titleGap={titleGap} email={null} onBack={back!} onReset={askReset} />}
    {step === 'create-password' && <NewPassword copy={copy} theme={theme} titleGap={titleGap} email={null} onBack={back!} />}
    {picker === 'anchor' && <AnchorSheet copy={copy} theme={theme} locale={locale} today={today} anchor={anchor} onClose={() => setPicker(null)} onAnchor={setAnchor} />}
    {picker === 'zone' && <ZoneSheet copy={copy} theme={theme} locale={locale} now={now} timezone={timezone} onClose={() => setPicker(null)} onZone={setTimezone} />}
    {weekOpen && step === 'calendar' && <WeekMenu copy={copy} theme={theme} weekStart={weekStart} anchor={weekAnchor} onClose={() => setWeekOpen(false)} onSelect={day => { setWeekStart(day); setWeekOpen(false) }} />}
  </View>
}

function Primary({ label, disabled, theme, onPress }: { label: string; disabled?: boolean; theme: Theme; onPress: () => void }) {
  const fill = disabled ? (theme.scheme === 'dark' ? '#3f3832' : '#cfc6bb') : theme.fg
  const ink = disabled ? (theme.scheme === 'dark' ? '#8d847b' : '#8a8178') : theme.onAccent
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} style={[styles.primary, { backgroundColor: fill }]}>
    <Text style={[styles.primaryText, { color: ink }]}>{label}</Text>
  </Pressable>
}

const BENEFIT_ICONS = ['sync', 'phone'] as const
/** Apple is omitted until sign-in exists. `signInButtons` still places it above Google. */
const SIGN_IN_ENABLED = ['google'] as const satisfies readonly SignInProvider[]

function Choice({ copy, theme, titleGap, google, onLocal, onGoogle, onCancel }: {
  copy: Copy; theme: Theme; titleGap: number; google: GooglePhase; onLocal: () => void; onGoogle: () => void; onCancel: () => void
}) {
  const s = copy.start
  const pending = google === 'pending'
  return <Screen theme={theme} title={s.title} titleGap={titleGap} cta={<View style={styles.authStack}>
    {google === 'failed' && <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Icon name="info" size={18} color={theme.danger} />
      <Text style={[styles.errorText, { color: theme.danger }]}>{s.googleError}</Text>
    </View>}
    {signInButtons(SIGN_IN_ENABLED).map(id => id === 'apple'
      ? <AppleButton key={id} label={s.apple} />
      : <GoogleButton key={id} label={google === 'failed' ? s.googleRetry : s.google} pending={pending} browser={s.browser} back={s.back} focus={theme.focus} onPress={onGoogle} onCancel={onCancel} />)}
    <Pressable disabled={pending} onPress={onLocal} accessibilityRole="button" style={[styles.authButton, { backgroundColor: theme.checkFill }, pending && styles.dimmed]}>
      <View style={styles.slot}><Icon name="phone" size={20} color={theme.fg} /></View>
      <Text style={[styles.authLabel, { color: theme.fg }]}>{s.local}</Text>
    </Pressable>
  </View>}>
    <View style={styles.benefits}>
      {s.benefits.map((line, index) => <View key={line.lead} style={styles.benefit}>
        <View style={styles.benefitIcon}><Icon name={BENEFIT_ICONS[index] ?? 'info'} size={22} color={theme.fg} /></View>
        <View style={styles.benefitCopy}>
          <Text style={[styles.benefitLead, { color: theme.fg }]}>{line.lead}</Text>
          <Text style={[styles.benefitBody, { color: theme.secondary }]}>{line.body}</Text>
        </View>
      </View>)}
    </View>
  </Screen>
}

function AppleButton({ label }: { label: string }) {
  return <Pressable accessibilityRole="button" style={[styles.authButton, styles.appleButton]}>
    <View style={styles.slot}><Icon name="apple" size={20} color="#fff" /></View>
    <Text style={[styles.authLabel, styles.appleLabel]}>{label}</Text>
  </Pressable>
}

function GoogleButton({ label, pending, browser, back, focus, onPress, onCancel }: {
  label: string; pending: boolean; browser: string; back: string; focus: string; onPress: () => void; onCancel: () => void
}) {
  if (pending) return <View style={[styles.authButton, styles.googleButton]}>
    <View style={styles.slot}><ActivityIndicator color="#1f1f1f" /></View>
    <Text style={[styles.authLabel, styles.googleLabel, styles.authLabelWait]}>{browser}</Text>
    <Pressable onPress={onCancel} hitSlop={8}><Text style={[styles.link, { color: focus }]}>{back}</Text></Pressable>
  </View>
  return <Pressable onPress={onPress} accessibilityRole="button" style={[styles.authButton, styles.googleButton]}>
    <View style={styles.slot}><GoogleMark /></View>
    <Text style={[styles.authLabel, styles.googleLabel]}>{label}</Text>
  </Pressable>
}

function GoogleMark() {
  return <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
}

function Calendar({ copy, theme, locale, titleGap, mode, timezone, weekStart, anchor, today, onBack, onMode, onOpen, onWeekMenu, onNext }: {
  copy: Copy; theme: Theme; locale: LocaleId; titleGap: number; mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchor: string; today: string
  onBack: () => void; onMode: (mode: 'rolling' | 'natural') => void; onOpen: (picker: Picker) => void
  onWeekMenu: (anchor: WeekAnchor) => void; onNext: () => void
}) {
  const s = copy.start
  const weekRef = useRef<View>(null)
  const openWeek = () => {
    const node = weekRef.current
    if (!node) { onWeekMenu({ x: 0, y: 280, width: 200, height: 48 }); return }
    node.measureInWindow((x, y, width, height) => onWeekMenu({ x, y, width, height }))
  }
  return <Screen theme={theme} title={s.calendarTitle} titleGap={titleGap} onBack={onBack} backLabel={s.back} cta={<Primary theme={theme} label={s.next} onPress={onNext} />}>
    <View style={styles.stack}>
      <ModeRow theme={theme} selected={mode === 'rolling'} title={s.rolling} body={s.rollingBody} tag={s.defaultTag} onPress={() => onMode('rolling')} />
      <ModeRow theme={theme} selected={mode === 'natural'} title={s.natural} body={s.naturalBody} onPress={() => onMode('natural')} />
    </View>
    <View style={[styles.group, { backgroundColor: theme.raised }]}>
      {calendarAnchorVisible(mode) && <GroupRow theme={theme} label={s.anchor} value={showDate(copy, today, anchor)} onPress={() => onOpen('anchor')} />}
      {calendarAnchorVisible(mode) && <View style={[styles.hairline, { backgroundColor: theme.line }]} />}
      <GroupRow theme={theme} label={s.timezone} value={friendlyZoneName(timezone, locale)} onPress={() => onOpen('zone')} />
      <View style={[styles.hairline, { backgroundColor: theme.line }]} />
      <GroupRow theme={theme} rowRef={weekRef} label={s.weekFrom} value={s.weekdays[weekStart - 1] ?? s.weekdays[0]!} cue="menu" onPress={openWeek} />
    </View>
    <Text style={[styles.footer, { color: theme.secondary }]}>{s.lockFoot}</Text>
  </Screen>
}

function ModeRow({ theme, selected, title, body, tag, onPress }: {
  theme: Theme; selected: boolean; title: string; body: string; tag?: string; onPress: () => void
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.card, { backgroundColor: theme.raised, borderColor: selected ? theme.fg : theme.line, borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth }]}>
    <View style={styles.modeCopy}>
      <View style={styles.modeTitle}>
        {selected && <View style={[styles.accentDot, { backgroundColor: accentOrange }]} />}
        <Text style={[styles.cardTitle, { color: theme.fg }]}>{title}</Text>
        {!!tag && <Text style={[styles.tag, { color: theme.secondary, backgroundColor: theme.hover }]}>{tag}</Text>}
      </View>
      <Text style={[styles.cardNote, { color: theme.secondary }]}>{body}</Text>
    </View>
    <SelectMark theme={theme} selected={selected} />
  </Pressable>
}

function SelectMark({ theme, selected }: { theme: Theme; selected: boolean }) {
  if (selected) return <View style={[styles.checkCircle, { backgroundColor: theme.fg }]}><Icon name="check" size={16} color={theme.onAccent} strokeWidth={2.2} /></View>
  return <View style={[styles.radio, { borderColor: theme.checkEdge }]} />
}

function GroupRow({ theme, label, value, cue = 'chevron', rowRef, onPress }: {
  theme: Theme; label: string; value: string; cue?: 'chevron' | 'menu'; rowRef?: RefObject<View | null>; onPress: () => void
}) {
  return <View ref={rowRef} collapsable={false}>
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.groupRow}>
      <Text style={[styles.groupLabel, { color: theme.fg }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.groupValue, { color: theme.secondary }]}>{value}</Text>
      <View style={styles.groupChevron}><Icon name={cue === 'menu' ? 'down' : 'next'} size={16} color={theme.faint} /></View>
    </Pressable>
  </View>
}

function Direction({ copy, theme, titleGap, value, onChange, onBack, onNext }: {
  copy: Copy; theme: Theme; titleGap: number; value: string; onChange: (value: string) => void; onBack: () => void; onNext: () => void
}) {
  const s = copy.start
  const input = useRef<TextInput>(null)
  const armReturn = () => {
    applyContinueReturnKey(s.continue)
    setTimeout(() => applyContinueReturnKey(s.continue), 80)
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => { input.current?.focus(); applyContinueReturnKey(s.continue) })
    const later = setTimeout(() => applyContinueReturnKey(s.continue), 80)
    return () => { cancelAnimationFrame(frame); clearTimeout(later) }
  }, [s.continue])
  const ready = value.trim().length > 0
  return <Screen theme={theme} title={s.directionTitle} titleGap={titleGap} onBack={onBack} backLabel={s.back} avoid={false} scroll={false} cta={<Primary theme={theme} label={s.continue} disabled={!ready} onPress={onNext} />}>
    <View style={styles.fill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
      <View style={[styles.insetField, { backgroundColor: theme.scheme === 'dark' ? theme.surface : '#fff', borderColor: theme.line }]}>
        <TextInput
          ref={input}
          value={value}
          onChangeText={onChange}
          onFocus={armReturn}
          clearButtonMode="while-editing"
          returnKeyType="done"
          returnKeyLabel={s.continue}
          enablesReturnKeyAutomatically
          onSubmitEditing={() => { if (value.trim()) onNext() }}
          style={[styles.insetInput, { color: theme.fg }]}
        />
        {Platform.OS !== 'ios' && value.length > 0 && <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel={s.clear}><Icon name="close" size={16} color={theme.secondary} /></Pressable>}
      </View>
      <StickySuggestions examples={s.examples} theme={theme} onPick={onChange} />
    </View>
  </Screen>
}

/**
 * One suggestion row, always mounted under the field. An iOS input accessory
 * registered after focus never attaches, so assuming the keyboard is already
 * open hides the only copy of the chips. This row moves from keyboard frames.
 * A dismiss frame keeps its height and sits on the screen bottom, so that frame
 * and keyboardWillHide both put the row back under the field.
 */
function StickySuggestions({ examples, theme, onPick }: { examples: readonly string[]; theme: Theme; onPick: (value: string) => void }) {
  const shift = useRef(new Animated.Value(0)).current
  const anchor = useRef<View>(null)
  const lastTop = useRef(0)
  const placeRef = useRef<(top: number, duration: number | undefined) => void>(() => undefined)
  const { height } = useWindowDimensions()
  useEffect(() => {
    let alive = true
    const place = (top: number, duration: number | undefined) => {
      lastTop.current = top
      anchor.current?.measureInWindow((_x, y, _width, rowHeight) => {
        if (!alive) return
        const next = suggestionShift(y + rowHeight, top, 8)
        shift.stopAnimation()
        Animated.timing(shift, { toValue: next, duration: keyboardDuration(duration), easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
      })
    }
    placeRef.current = place
    const onFrame = (event: KeyboardEvent) => {
      place(keyboardFrameTop(event.endCoordinates, height), event.duration)
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', onFrame)
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', event => {
      place(0, Platform.OS === 'ios' ? event.duration : 200)
    })
    if (lastTop.current > 0) place(lastTop.current, 16)
    return () => { alive = false; show.remove(); hide?.remove() }
  }, [height, shift])
  return <View ref={anchor} collapsable={false} onLayout={() => { if (lastTop.current > 0) placeRef.current(lastTop.current, 16) }}>
    <Animated.View style={{ transform: [{ translateY: shift }] }}>
      <Suggestions examples={examples} theme={theme} onPick={onPick} />
    </Animated.View>
  </View>
}

function Suggestions({ examples, theme, onPick }: { examples: readonly string[]; theme: Theme; onPick: (value: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.suggestionRow}>
    {examples.map(example => <Pressable key={example} onPress={() => onPick(example)} style={[styles.suggestion, { backgroundColor: theme.hover }]}>
      <Text style={{ color: theme.fg, fontSize: 15 }}>{example}</Text>
    </Pressable>)}
  </ScrollView>
}

function JoinPassword({ copy, theme, titleGap, email, onBack, onReset }: {
  copy: Copy; theme: Theme; titleGap: number; email: string | null; onBack: () => void; onReset: () => void
}) {
  const s = copy.start
  const [password, setPassword] = useState('')
  return <Screen theme={theme} title={s.enterTitle} titleGap={titleGap} onBack={onBack} backLabel={s.back} extra={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary theme={theme} label={s.startSync} disabled={password.trim().length < 8} onPress={() => undefined} />}>
    <View style={styles.labelRow}>
      <View style={styles.fill} />
      <Pressable onPress={onReset} hitSlop={8}><Text style={[styles.link, { color: theme.focus }]}>{s.resetSync}</Text></Pressable>
    </View>
    <Secret copy={copy} theme={theme} value={password} onChange={setPassword} label={s.enterTitle} />
  </Screen>
}

function NewPassword({ copy, theme, titleGap, email, onBack }: { copy: Copy; theme: Theme; titleGap: number; email: string | null; onBack: () => void }) {
  const s = copy.start
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const ready = syncPasswordReady(password, again)
  const longEnough = password.trim().length >= 8
  const mismatch = again.length > 0 && password.trim() !== again.trim()
  return <Screen theme={theme} title={s.newTitle} titleGap={titleGap} onBack={onBack} backLabel={s.back} extra={email ? <EmailChip theme={theme} email={email} /> : null} cta={<Primary theme={theme} label={s.continue} disabled={!ready} onPress={() => undefined} />}>
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

function WeekMenu({ copy, theme, weekStart, anchor, onClose, onSelect }: {
  copy: Copy; theme: Theme; weekStart: number; anchor: WeekAnchor; onClose: () => void; onSelect: (day: number) => void
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const menuWidth = Math.min(260, width - 32)
  const menuHeight = copy.start.weekdays.length * 48 + 8
  const top = Math.max(insets.top + 8, Math.min(anchor.y - menuHeight - 6, height - insets.bottom - menuHeight - 8))
  const left = Math.max(16, Math.min(anchor.x + anchor.width - menuWidth, width - menuWidth - 16))
  const card = theme.scheme === 'dark' ? theme.raised : '#fff'
  return <View style={styles.menuWrap} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={copy.start.cancel} />
    <View accessibilityRole="menu" style={[styles.menu, { top, left, width: menuWidth, backgroundColor: card }]}>
      {copy.start.weekdays.map((name, index) => {
        const selected = index + 1 === weekStart
        const last = index === copy.start.weekdays.length - 1
        return <Pressable key={name} onPress={() => onSelect(index + 1)} accessibilityRole="menuitem" accessibilityState={{ selected }} style={[styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
          <View style={styles.menuCheck}>{selected && <Icon name="check" size={16} color={theme.fg} strokeWidth={2} />}</View>
          <Text style={{ flex: 1, color: theme.fg, fontSize: 17, fontWeight: selected ? '600' : '400' }}>{name}</Text>
          {selected && <View style={[styles.accentDot, { backgroundColor: accentOrange }]} />}
        </Pressable>
      })}
    </View>
  </View>
}

function AnchorSheet({ copy, theme, locale, today, anchor, onClose, onAnchor }: {
  copy: Copy; theme: Theme; locale: LocaleId; today: string; anchor: string; onClose: () => void; onAnchor: (value: string) => void
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState(() => clampAnchorDate(anchor, today))
  return <View style={styles.sheetWrap}>
    <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose} />
    <View style={styles.sheetHost} pointerEvents="box-none">
      <DragSheet onDismiss={onClose} grab={theme.line} style={[styles.anchorSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16, maxHeight: height * 0.92 }]}>
        <SheetBody style={{ maxHeight: Math.round(height * 0.62) }}>
          <AnchorCalendar theme={theme} locale={locale} today={today} value={draft} onSelect={setDraft} />
        </SheetBody>
        <View style={styles.sheetCta}>
          <Primary theme={theme} label={copy.start.ok} onPress={() => { onAnchor(clampAnchorDate(draft, today)); onClose() }} />
        </View>
      </DragSheet>
    </View>
  </View>
}

function ZoneSheet({ copy, theme, locale, now, timezone, onClose, onZone }: {
  copy: Copy; theme: Theme; locale: LocaleId; now: string; timezone: string; onClose: () => void; onZone: (value: string) => void
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const s = copy.start
  const [query, setQuery] = useState('')
  const at = useMemo(() => new Date(now), [now])
  const zones = useMemo(() => {
    const all = readTimeZones()
    return all.includes(timezone) ? all : [timezone, ...all]
  }, [timezone])
  const names = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const id of zones) {
      const runtime = runtimeZoneName(id, locale)
      const localized = zoneLocalizedNames(id)
      map.set(id, runtime ? [...localized, runtime] : localized)
    }
    return map
  }, [zones, locale])
  const offsets = useMemo(() => {
    const map = new Map<string, string>()
    for (const id of zones) {
      const minutes = zoneOffsetMinutes(id, at)
      map.set(id, minutes == null ? 'GMT' : zoneOffsetLabel(minutes))
    }
    return map
  }, [zones, at])
  const { pinned, rest } = useMemo(
    () => timeZonePickerList(zones, timezone, query, id => names.get(id) ?? [], at),
    [zones, timezone, query, names, at],
  )
  const card = theme.scheme === 'dark' ? theme.raised : '#fff'
  const pick = (id: string) => { onZone(id); onClose() }
  return <View style={styles.sheetWrap}>
    <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose} />
    <View style={styles.sheetHost} pointerEvents="box-none">
      <DragSheet onDismiss={onClose} grab={theme.line} style={[styles.zoneSheet, { height: height - insets.top - 8, backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.zoneHeader}>
          <Text style={[styles.zoneTitle, { color: theme.fg }]}>{s.timezone}</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.zoneCancel} accessibilityRole="button">
            <Text style={{ color: theme.fg, fontSize: 17 }}>{s.cancel}</Text>
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: theme.checkFill }]}>
          <Icon name="search" size={18} color={theme.secondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder={s.search} placeholderTextColor={theme.faint} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" style={[styles.searchInput, { color: theme.fg }]} />
          {Platform.OS !== 'ios' && query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={s.clear}><Icon name="close" size={16} color={theme.secondary} /></Pressable>}
        </View>
        <SheetBody style={styles.zoneList}>
          {pinned && <View style={[styles.zoneCard, { backgroundColor: card }]}>
            <ZoneRow theme={theme} id={pinned} locale={locale} query={query} offset={offsets.get(pinned) ?? 'GMT'} selected onPress={() => pick(pinned)} />
          </View>}
          {rest.length > 0 && <View style={[styles.zoneCard, styles.zoneListCard, { backgroundColor: card }]}>
            {rest.map((id, index) => <View key={id}>
              {index > 0 && <View style={[styles.hairline, { backgroundColor: theme.line }]} />}
              <ZoneRow theme={theme} id={id} locale={locale} query={query} offset={offsets.get(id) ?? 'GMT'} selected={false} onPress={() => pick(id)} />
            </View>)}
          </View>}
        </SheetBody>
      </DragSheet>
    </View>
  </View>
}

function ZoneRow({ theme, id, locale, query, offset, selected, onPress }: {
  theme: Theme; id: string; locale: LocaleId; query: string; offset: string; selected: boolean; onPress: () => void
}) {
  const city = friendlyZoneName(id, locale)
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={styles.zoneRow}>
    <View style={styles.zoneText}>
      <Text numberOfLines={1} style={{ color: theme.fg, fontSize: 17 }}>{highlight(city, query, accentOrange, theme.fg)}</Text>
      <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 13, marginTop: 1 }}>{highlight(id, query, accentOrange, theme.secondary)}</Text>
    </View>
    <Text style={{ color: theme.secondary, fontSize: 15 }}>{offset}</Text>
    <View style={styles.zoneCheck}>{selected && <Icon name="check" size={16} color={theme.fg} strokeWidth={2} />}</View>
  </Pressable>
}

function highlight(text: string, query: string, hit: string, rest: string) {
  return highlightSpans(text, query).map((span, index) => <Text key={`${span.text}-${index}`} style={{ color: span.hit ? hit : rest }}>{span.text}</Text>)
}

function SheetBody({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scrollY = useContext(SheetScrollY)
  useEffect(() => {
    if (scrollY) scrollY.current = 0
    return () => { if (scrollY) scrollY.current = 0 }
  }, [scrollY])
  return <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" bounces={false} scrollEventThrottle={16} style={style} onScroll={event => { if (scrollY) scrollY.current = event.nativeEvent.contentOffset.y }}>{children}</ScrollView>
}

function DragSheet({ onDismiss, grab, style, children }: { onDismiss: () => void; grab: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current
  const host = useRef<View>(null)
  const top = useRef(0)
  const height = useRef(480)
  const scrollY = useRef(0)
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
    onMoveShouldSetPanResponder: (_event, gesture) => shouldDragSheet(gesture.dy, gesture.dx, scrollY.current, gesture.moveY - gesture.dy - top.current),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const take = shouldDragSheet(gesture.dy, gesture.dx, scrollY.current, gesture.moveY - gesture.dy - top.current)
      if (take) lead.current = gesture.dy
      return take
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { translateY.stopAnimation() },
    onPanResponderMove: (_event, gesture) => { translateY.setValue(Math.max(0, lead.current + gesture.dy)) },
    onPanResponderRelease: (_event, gesture) => release(Math.max(0, lead.current + gesture.dy), gesture.vy),
    onPanResponderTerminate: () => release(0, 0),
  })).current
  const grabber = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => {
      const take = shouldDragSheet(gesture.dy, gesture.dx, 0, 0)
      if (take) lead.current = gesture.dy
      return take
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { translateY.stopAnimation() },
    onPanResponderMove: (_event, gesture) => { translateY.setValue(Math.max(0, lead.current + gesture.dy)) },
    onPanResponderRelease: (_event, gesture) => release(Math.max(0, lead.current + gesture.dy), gesture.vy),
    onPanResponderTerminate: () => release(0, 0),
  })).current
  return <SheetScrollY.Provider value={scrollY}>
    <Animated.View ref={host} collapsable={false} onLayout={measure} {...pan.panHandlers} style={[style, { transform: [{ translateY }] }]}>
      <View style={styles.grabHit} {...grabber.panHandlers}><View style={[styles.grab, { backgroundColor: grab }]} /></View>
      {children}
    </Animated.View>
  </SheetScrollY.Provider>
}

function showDate(copy: Copy, today: string, ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const chip = copy.start.monthDay(month ?? 1, day ?? 1)
  if (ymd === today) return copy.start.anchorToday(chip)
  if (String(year) !== today.slice(0, 4)) return `${year} · ${chip}`
  return chip
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'visible' },
  benefits: { gap: 22 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitIcon: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center' },
  benefitCopy: { flex: 1 },
  benefitLead: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  benefitBody: { fontSize: 15, lineHeight: 21, marginTop: 2 },
  authStack: { gap: 12 },
  authButton: { minHeight: 52, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  googleButton: { backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#dadce0' },
  appleButton: { backgroundColor: '#000' },
  appleLabel: { color: '#fff' },
  slot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  authLabel: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', marginRight: 24 },
  authLabelWait: { marginRight: 0 },
  googleLabel: { color: '#1f1f1f' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
  errorText: { flex: 1, fontSize: 15, lineHeight: 20 },
  stack: { gap: 12 },
  card: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardNote: { fontSize: 14, lineHeight: 20 },
  dimmed: { opacity: 0.38 },
  link: { fontSize: 16 },
  modeTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5 },
  tag: { fontSize: 12, fontWeight: '600', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  group: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  groupRow: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupLabel: { fontSize: 16, flex: 1 },
  groupValue: { fontSize: 16, maxWidth: '58%' },
  groupChevron: { width: 16, alignItems: 'center' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footer: { fontSize: 13, lineHeight: 18, marginTop: 8, marginHorizontal: 16 },
  primary: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  insetField: { minHeight: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 12, paddingRight: 8, flexDirection: 'row', alignItems: 'center' },
  insetInput: { flex: 1, fontSize: 17, minHeight: 44, paddingVertical: 8 },
  suggestionRow: { gap: 8, paddingVertical: 10 },
  suggestion: { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  labelRow: { flexDirection: 'row', marginBottom: 8 },
  fieldLabel: { fontSize: 13, marginTop: 16, marginBottom: 8 },
  secret: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingLeft: 14, paddingRight: 12, flexDirection: 'row', alignItems: 'center' },
  secretInput: { flex: 1, fontSize: 17, paddingVertical: 12 },
  rule: { marginTop: 8 },
  email: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  menu: { position: 'absolute', borderRadius: 14, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuRow: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuCheck: { width: 18, alignItems: 'center' },
  sheetWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheetHost: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  anchorSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  zoneSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  grabHit: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  grab: { width: 36, height: 5, borderRadius: 3 },
  sheetCta: { paddingHorizontal: 20, paddingTop: 8 },
  zoneHeader: { minHeight: 44, justifyContent: 'center', marginHorizontal: 16 },
  zoneTitle: { textAlign: 'center', fontSize: 17, fontWeight: '600', marginHorizontal: 88 },
  zoneCancel: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  search: { marginHorizontal: 16, marginTop: 8, marginBottom: 12, minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, fontSize: 17, minHeight: 40, paddingVertical: 8 },
  zoneList: { flex: 1 },
  zoneCard: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  zoneListCard: { marginTop: 12 },
  zoneRow: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneText: { flex: 1 },
  zoneCheck: { width: 18, alignItems: 'flex-end' },
})
