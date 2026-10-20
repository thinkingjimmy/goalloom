/**
 * [INPUT]: Theme, Android content target, native glass availability and the reduced-transparency preference.
 * [OUTPUT]: Native Liquid Glass with a blur fallback and an opaque accessibility surface.
 * [POS]: Bottom navigation material; keeps content separate from background effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode, RefObject } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import type { Theme } from '../theme'

const nativeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable()

export function NavigationGlassGroup({ children, style }: { children: ReactNode; style: StyleProp<ViewStyle> }) {
  return nativeGlass ? <GlassContainer spacing={8} style={style} pointerEvents="box-none">{children}</GlassContainer>
    : <View style={style} pointerEvents="box-none">{children}</View>
}

export function NavigationMaterial({ theme, reduceTransparency, blurTarget, children, style, testID }: {
  theme: Theme; reduceTransparency: boolean; blurTarget: RefObject<View | null>; children: ReactNode; style: StyleProp<ViewStyle>; testID: string
}) {
  if (reduceTransparency) return <View testID={`${testID}-opaque`} style={[style, { backgroundColor: theme.raised, borderColor: theme.line, borderWidth: StyleSheet.hairlineWidth }]}>{children}</View>
  if (nativeGlass) return <GlassView testID={`${testID}-liquid`} style={style} glassEffectStyle="regular" colorScheme={theme.scheme}>{children}</GlassView>
  return <View testID={`${testID}-blur`} style={[style, { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.edge }]}>
    <BlurView pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={70}
      tint={theme.scheme === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'} style={StyleSheet.absoluteFill} />
    {children}
  </View>
}
