/**
 * [INPUT]: Theme, an optional title, an optional trailing title action, an optional under-title accessory, an optional footer action, and an optional title gap below the status bar.
 * [OUTPUT]: One setup header. Onboarding passes the same titleGap on every step. A back control, at least 52pt and free to grow, sits left of the footer action when a previous step exists.
 * [POS]: Shared chrome for onboarding steps and the AI connect intro.
 */
import { useRef, type ReactNode } from 'react'
import { KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from './icons'
import type { Theme } from './theme'

export function SetupScreen({ theme, title, intro, extra, onBack, backLabel, right, cta, avoid = true, scroll = true, titleGap = 0, children }: {
  theme: Theme
  title?: string
  intro?: ReactNode
  extra?: ReactNode
  onBack?: (() => void) | null
  backLabel?: string
  right?: ReactNode
  cta?: ReactNode
  avoid?: boolean
  scroll?: boolean
  /** Distance from the status bar to the title. Onboarding uses one sixth of the screen. */
  titleGap?: number
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const bodyStyle = [styles.body, titleGap > 0 && { paddingTop: titleGap }]
  const body = <>
    {intro}
    {(!!title || !!right || !!extra) && <View style={styles.titleBlock}>
      {(!!title || !!right) && <View style={styles.titleRow}>
        {!!title && <Text style={[styles.title, { color: theme.fg }]}>{title}</Text>}
        {right}
      </View>}
      {!!extra && <View style={styles.extra}>{extra}</View>}
    </View>}
    {children}
  </>
  return <KeyboardAvoidingView style={styles.fill} behavior={avoid && Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.fill, { paddingTop: Platform.OS === 'web' ? 12 : insets.top }]}>
      {!!onBack && <EdgeBack onBack={onBack} />}
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={bodyStyle}>{body}</ScrollView>
        : <View style={[bodyStyle, styles.fill]}>{body}</View>}
      {(cta || onBack) && <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
        {onBack ? <View style={styles.footerRow}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={backLabel} style={[styles.backButton, { backgroundColor: theme.checkFill, borderColor: theme.line }]}>
            <Icon name="back" size={22} color={theme.fg} />
          </Pressable>
          {!!cta && <View style={styles.fill}>{cta}</View>}
        </View> : cta}
      </View>}
    </View>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 4 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  titleBlock: { marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.4 },
  extra: { marginTop: 12 },
  ctaBar: { paddingHorizontal: 20, paddingTop: 8 },
  footerRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  backButton: { minWidth: 52, minHeight: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
})
