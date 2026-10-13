/**
 * [INPUT]: Locale copy, the saved provider (never the key), and connect / disconnect callbacks.
 * [OUTPUT]: The shared AI intro and the keyboard-attached key sheet. A passing check stores the key, then shows the provider.
 * [POS]: Onboarding step 3 and Settings › AI 服务. The key stays in the platform secret store.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated, Easing, Keyboard, KeyboardAvoidingView, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AI_KEY_URL, AI_PROVIDERS, aiKeyAccepted, probeAiKey, sheetRelease, shouldDragSheet, type AiConnection, type AiProviderId,
} from '@goalloom/local-store'
import { clearAiConnection, saveAiConnection } from './ai-account'
import type { Copy } from './copy'
import { Icon } from './icons'
import { SetupScreen } from './setup-screen'
import type { Theme } from './theme'

const INK = '#2b2621'
const INK_TEXT = '#fbf9f6'

export function AiConnect({ copy, theme, connection, onConnection, onBack, onDone }: {
  copy: Copy
  theme: Theme
  connection: AiConnection | null
  onConnection: (next: AiConnection | null) => void
  onBack: () => void
  onDone?: () => void
}) {
  const s = copy.start
  const [open, setOpen] = useState(false)
  const name = connection ? s.aiProviders[connection.provider] : ''
  const disconnect = async () => {
    try {
      await clearAiConnection()
      onConnection(null)
    } catch { /* A failed delete keeps the connected row. */ }
  }
  return <View style={styles.fill}>
    <SetupScreen theme={theme} title={s.aiTitle} onBack={onBack} backLabel={s.back} avoid={!open} scroll={false} right={onDone ? <Pressable onPress={onDone} hitSlop={8} style={styles.later}><Text style={[styles.link, { color: theme.fg }]}>{s.aiLater}</Text></Pressable> : null} cta={!connection ? <Primary label={s.aiConnect} onPress={() => setOpen(true)} /> : onDone ? <Primary label={s.aiEnter} onPress={onDone} /> : null}>
      <Text style={[styles.line, { color: theme.secondary }]}>{s.aiLine}</Text>
      {connection ? <View style={[styles.card, { backgroundColor: theme.raised, borderColor: theme.line }]}>
        <Text style={[styles.connected, { color: theme.fg }]}>{s.aiConnected(name)}</Text>
        <Pressable onPress={() => { void disconnect() }} hitSlop={8} accessibilityRole="button"><Text style={[styles.link, { color: theme.danger }]}>{s.aiDisconnect}</Text></Pressable>
      </View> : <View style={[styles.card, { backgroundColor: theme.raised, borderColor: theme.line }]}>
        <Text style={[styles.example, { color: theme.fg }]}>{s.aiExample}</Text>
        <Text style={{ color: theme.faint, fontSize: 16 }}>↓</Text>
        {s.aiTasks.map(task => <View key={task.title} style={styles.task}>
          <View style={[styles.box, { borderColor: theme.checkEdge }]} />
          <Text numberOfLines={1} style={[styles.taskTitle, { color: theme.fg }]}>{task.title}</Text>
          <Text style={[styles.tag, { color: theme.secondary, backgroundColor: theme.hover }]}>{task.tag}</Text>
        </View>)}
      </View>}
    </SetupScreen>
    {open && <ConnectSheet copy={copy} theme={theme} onClose={() => setOpen(false)} onConnected={next => { onConnection(next); setOpen(false) }} />}
  </View>
}

function Primary({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}>
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
}

function ConnectSheet({ copy, theme, onClose, onConnected }: {
  copy: Copy; theme: Theme; onClose: () => void; onConnected: (next: AiConnection) => void
}) {
  const s = copy.start
  const insets = useSafeAreaInsets()
  const input = useRef<TextInput>(null)
  const [provider, setProvider] = useState<AiProviderId>('openrouter')
  const [key, setKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  const name = s.aiProviders[provider]
  const ready = aiKeyAccepted(key, consent) && !working
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false))
    const focus = setTimeout(() => input.current?.focus(), 50)
    return () => { show.remove(); hide.remove(); clearTimeout(focus) }
  }, [])
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim()
    if (text) setKey(text.slice(0, 512))
  }
  const test = async () => {
    if (!aiKeyAccepted(key, consent) || working) return
    setWorking(true)
    setError(null)
    const typed = key.trim()
    const result = await probeAiKey(provider, typed)
    if (result !== 'ok') {
      setWorking(false)
      setError(result === 'rejected' ? s.aiRejected : s.aiUnavailable)
      return
    }
    try {
      const at = new Date().toISOString()
      const next = await saveAiConnection({ provider, apiKey: typed, consentedAt: at, verifiedAt: at })
      setKey('')
      onConnected(next)
    } catch {
      setError(s.aiUnavailable)
      setWorking(false)
    }
  }
  return <View style={styles.sheetWrap}>
    <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={working ? undefined : onClose} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetHost} pointerEvents="box-none">
      <Lift onDismiss={onClose} enabled={!working}>
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: keyboard ? 12 : insets.bottom + 16, marginBottom: keyboard ? 8 : 0 }]}>
          <View style={[styles.grab, { backgroundColor: theme.line }]} />
          <View style={[styles.segment, { backgroundColor: theme.hover }]}>
            {AI_PROVIDERS.map(id => <Pressable key={id} onPress={() => { setProvider(id); setError(null) }} style={[styles.segmentItem, provider === id && { backgroundColor: theme.raised }]}>
              <Text numberOfLines={1} style={{ color: theme.fg, fontSize: 13, fontWeight: provider === id ? '600' : '400' }}>{s.aiProviders[id]}</Text>
            </Pressable>)}
          </View>
          <View style={[styles.secret, { borderColor: theme.line, backgroundColor: theme.raised }]}>
            <TextInput ref={input} value={key} onChangeText={value => { setKey(value); setError(null) }} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={512} editable={!working} placeholder={s.aiKeyPlaceholder} placeholderTextColor={theme.faint} style={[styles.secretInput, { color: theme.fg }]} />
            <Pressable onPress={() => { void paste() }} hitSlop={8} disabled={working}><Text style={[styles.link, { color: theme.focus }]}>{s.aiPaste}</Text></Pressable>
          </View>
          <Pressable onPress={() => { void Linking.openURL(AI_KEY_URL[provider]) }} hitSlop={6}><Text style={[styles.getKey, { color: theme.focus }]}>{s.aiGetKey(name)}</Text></Pressable>
          <Pressable onPress={() => setConsent(value => !value)} disabled={working} style={styles.checkRow}>
            <View style={[styles.box, { borderColor: theme.checkEdge, backgroundColor: consent ? INK : 'transparent' }]}>{consent && <Icon name="check" size={14} color={INK_TEXT} />}</View>
            <Text style={[styles.consent, { color: theme.fg }]}>{s.aiConsent(name)}</Text>
          </Pressable>
          {!!error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
          <Primary label={working ? s.aiTesting : s.aiTest} disabled={!ready} onPress={() => { void test() }} />
        </View>
      </Lift>
    </KeyboardAvoidingView>
  </View>
}

function Lift({ onDismiss, enabled, children }: { onDismiss: () => void; enabled: boolean; children: ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current
  const host = useRef<View>(null)
  const top = useRef(0)
  const height = useRef(360)
  const lead = useRef(0)
  const allow = useRef(enabled)
  allow.current = enabled
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const measure = () => {
    host.current?.measureInWindow((_x, y, _width, measured) => {
      top.current = y
      if (measured > 0) height.current = measured
    })
  }
  const release = (distance: number, velocity: number) => {
    if (!allow.current) { Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start(); return }
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
      if (!allow.current) return false
      const take = shouldDragSheet(gesture.dy, gesture.dx, 0, gesture.moveY - gesture.dy - top.current)
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  later: { paddingTop: 8, paddingHorizontal: 4 },
  line: { fontSize: 16, lineHeight: 22, marginBottom: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  example: { fontSize: 15, lineHeight: 22 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskTitle: { flex: 1, fontSize: 15 },
  tag: { fontSize: 12, fontWeight: '600', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  connected: { fontSize: 17, fontWeight: '600' },
  link: { fontSize: 16 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: INK },
  disabled: { opacity: 0.38 },
  primaryText: { color: INK_TEXT, fontSize: 17, fontWeight: '600' },
  sheetWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 4 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2 },
  segmentItem: { flex: 1, minHeight: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  secret: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingLeft: 14, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secretInput: { flex: 1, fontSize: 17, paddingVertical: 12 },
  getKey: { fontSize: 15 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consent: { flex: 1, fontSize: 15, lineHeight: 21 },
  error: { fontSize: 13, lineHeight: 18 },
})
