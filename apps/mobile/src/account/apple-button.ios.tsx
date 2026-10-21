/**
 * [INPUT]: Native Apple availability, shared busy state and explicit sign-in intent.
 * [OUTPUT]: Apple's localized native Continue button with a 52pt target.
 * [POS]: iOS-only provider control. Native branding is supplied by AuthenticationServices.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { View } from 'react-native'
import { AppleAuthenticationButton, AppleAuthenticationButtonStyle, AppleAuthenticationButtonType } from 'expo-apple-authentication'
export function AppleButton({ disabled, dark, onPress }: { disabled: boolean; dark: boolean; onPress: () => void }) {
  return <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled }} style={{ opacity: disabled ? 0.45 : 1 }}>
    <AppleAuthenticationButton testID="account-apple" buttonType={AppleAuthenticationButtonType.CONTINUE} buttonStyle={dark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK} cornerRadius={14} style={{ height: 52, width: '100%' }} onPress={onPress} />
  </View>
}
