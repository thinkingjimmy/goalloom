/**
 * [INPUT]: The shared account service state, locale and theme.
 * [OUTPUT]: Account sign-in/sign-out controls without workspace mutation.
 * [POS]: Account settings surface; sync setup is composed here by the mobile sync coordinator.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Alert, Pressable, Text, View } from 'react-native'
import type { Copy, LocaleId } from '@goalloom/local-store'
import { SetupScreen } from '../setup-screen'
import type { Theme } from '../theme'
import { AccountButtons } from './buttons'
import { accountCopy } from './copy'
import type { AccountState } from './types'
import { accountService } from './service'
export function AccountScreen({ state, copy, locale, theme, onBack }: { state: AccountState; copy: Copy; locale: LocaleId; theme: Theme; onBack: () => void }) {
  const text = accountCopy(locale)
  const signOut = () => Alert.alert(text.signOut, text.keepLocal, [
    { text: copy.start.cancel, style: 'cancel' },
    { text: text.signOut, onPress: () => { void accountService.signOut() } },
  ])
  return <SetupScreen theme={theme} title={text.title} onBack={onBack} backLabel={copy.start.back}>
    <View style={{ gap: 20, marginTop: 28 }}>
      <AccountButtons state={state} copy={copy} locale={locale} theme={theme} onSignIn={provider => { void accountService.signIn(provider) }} />
      {state.phase === 'signed-in' && <>
        <Text style={{ color: theme.secondary, fontSize: 15, lineHeight: 22 }}>{text.keepLocal}</Text>
        <Pressable testID="account-sign-out" accessibilityRole="button" onPress={signOut} style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.checkFill }}><Text style={{ color: theme.fg, fontSize: 16 }}>{text.signOut}</Text></Pressable>
      </>}
    </View>
  </SetupScreen>
}
