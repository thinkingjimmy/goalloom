/**
 * [INPUT]: A new completion token and native accessibility motion preferences.
 * [OUTPUT]: A noninteractive pair of confetti or single-emoji bursts, stopped on replacement or reduced motion.
 * [POS]: Mobile decoration player; view.tsx owns completion and column guards.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { chooseCelebrationShape } from './celebration-shape'

const colors = ['#F5BA35', '#EE715B', '#E16EAA', '#8874DE', '#55A9E3', '#46B8A0', '#F2D77B']

export function Confetti({ token }: { token: number }) {
  const progress = useRef(new Animated.Value(0)).current
  const accepted = useRef(0)
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null)
  const [burst, setBurst] = useState<{ token: number; emoji: string | null } | null>(null)

  useEffect(() => {
    let active = true
    let changed = false
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReducedMotion(value)
    }).catch(() => undefined)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true
      setReducedMotion(value)
    })
    return () => { active = false; sub.remove() }
  }, [])

  useEffect(() => {
    if (token === accepted.current) return
    accepted.current = token
    if (reducedMotion !== false) return
    setBurst({ token, emoji: chooseCelebrationShape() })
  }, [token, reducedMotion])

  useEffect(() => {
    if (!burst) return
    if (reducedMotion !== false) { setBurst(null); return }
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    animation.start(({ finished }) => { if (finished) setBurst(current => current === burst ? null : current) })
    return () => animation.stop()
  }, [burst, progress, reducedMotion])

  if (!burst || reducedMotion !== false) return null
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.overlay}>
    {Array.from({ length: 28 }, (_, index) => {
      const side = index < 14 ? 1 : -1
      const angle = (24 + (index % 14) * 4) * Math.PI / 180
      const speed = 100 + (index * 19) % 150
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * speed * side] })
      const y = -Math.sin(angle) * speed * 1.35
      const translateY = progress.interpolate({ inputRange: [0, 0.62, 1], outputRange: [0, y, y + 140] })
      const opacity = progress.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] })
      const size = 18 + index % 7
      const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: [`${side * -10}deg`, `${side * 20}deg`] })
      return <Animated.View key={`${burst.token}-${index}`} style={{
        position: 'absolute', bottom: 18, ...(side === 1 ? { left: 8 } : { right: 8 }),
        width: burst.emoji ? size * 1.5 : 5 + index % 4,
        height: burst.emoji ? size * 1.5 : 8 + index % 5,
        borderRadius: 1, backgroundColor: burst.emoji ? 'transparent' : colors[index % colors.length],
        alignItems: 'center', justifyContent: 'center', opacity,
        transform: burst.emoji ? [{ translateX }, { translateY }, { rotate }] : [{ translateX }, { translateY }],
      }}>{burst.emoji && <Text allowFontScaling={false} style={{ fontSize: size, lineHeight: size * 1.5, includeFontPadding: false }}>{burst.emoji}</Text>}</Animated.View>
    })}
  </View>
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
})
