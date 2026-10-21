/**
 * [INPUT]: Shared account state, five-language copy and explicit provider intent.
 * [OUTPUT]: Apple/Google controls, visible waiting/failure and a signed-in summary.
 * [POS]: Reused by first-run and account settings; native Apple UI is platform-resolved.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { Copy, LocaleId } from '@goalloom/local-store'
import type { Theme } from '../theme'
import { accountCopy } from './copy'
import { AppleButton } from './apple-button'
import type { AccountState, AuthProvider } from './types'
export function AccountButtons({ state, copy, locale, theme, onSignIn }: { state: AccountState; copy: Copy; locale: LocaleId; theme: Theme; onSignIn: (provider: AuthProvider) => void }) {
  const text = accountCopy(locale), busy = state.phase === 'loading' || state.phase === 'signing-in'
  return <View style={{ gap: 12 }}>
    {state.error && <Text testID="account-error" accessibilityRole="alert" style={{ color: theme.danger, fontSize: 15 }}>{text[state.error]}</Text>}
    {state.phase === 'signed-in' ? <Text testID="account-email" style={{ color: theme.fg, fontSize: 16 }}>{state.email ?? text.signedIn}</Text> : <>
      {state.appleAvailable && <AppleButton disabled={busy} dark={theme.scheme === 'dark'} onPress={() => onSignIn('apple')} />}
      {state.enabled && <Pressable testID="account-google" accessibilityRole="button" accessibilityState={{ disabled: busy || !state.googleAvailable }} disabled={busy || !state.googleAvailable} onPress={() => onSignIn('google')} style={[styles.google, (busy || !state.googleAvailable) && { opacity: 0.45 }]}>
        <GoogleMark /><Text style={styles.label}>{copy.start.google}</Text>
      </Pressable>}
      {busy && <View accessibilityRole="progressbar" style={styles.wait}><ActivityIndicator color={theme.fg} /><Text style={{ color: theme.secondary }}>{text.working}</Text></View>}
      {!busy && (!state.enabled || !state.googleAvailable) && <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{state.enabled && state.appleAvailable ? text.googleConfiguration : text.configuration}</Text>}
    </>}
  </View>
}
const styles = StyleSheet.create({ google: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#dadce0', borderRadius: 14 }, label: { flex: 1, textAlign: 'center', marginRight: 18, color: '#1f1f1f', fontSize: 17, fontWeight: '600' }, wait: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 } })

function GoogleMark() {
  return <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
}
