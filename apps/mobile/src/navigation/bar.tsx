/**
 * [INPUT]: Active section, compact state, safe-area offset, theme and navigation callbacks.
 * [OUTPUT]: Glass bottom navigation with an interruptible selection slide and capture action.
 * [POS]: App-shell navigation; section changes remain immediate and do not mutate workspace data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Copy } from '../copy'
import { Icon } from '../icons'
import type { Theme } from '../theme'
import { NavigationGlassGroup, NavigationMaterial } from './material'

type Tab = 'board' | 'flow' | 'settings'
export const TAB_HEIGHT = 62

function useNavigationAccessibility() {
  const [reduceMotion, setReduceMotion] = useState(true)
  const [reduceTransparency, setReduceTransparency] = useState(true)
  useEffect(() => {
    let active = true
    let motionChanged = false
    let transparencyChanged = false
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { motionChanged = true; setReduceMotion(value) })
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !motionChanged) setReduceMotion(value) }).catch(() => undefined)
    let removeTransparency: () => void
    if (Platform.OS === 'web') {
      const preference = window.matchMedia('(prefers-reduced-transparency: reduce)')
      const change = () => setReduceTransparency(preference.matches)
      change()
      preference.addEventListener('change', change)
      removeTransparency = () => preference.removeEventListener('change', change)
    } else {
      const transparency = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => { transparencyChanged = true; setReduceTransparency(value) })
      void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (active && !transparencyChanged) setReduceTransparency(value) }).catch(() => undefined)
      removeTransparency = () => transparency.remove()
    }
    return () => { active = false; motion.remove(); removeTransparency() }
  }, [])
  return { reduceMotion, reduceTransparency }
}

export function TabBar({ copy, theme, tab, minimized, barBottom, blurTarget, onTab, onPlus }: {
  copy: Copy; theme: Theme; tab: Tab; minimized: boolean; barBottom: number; blurTarget: RefObject<View | null>
  onTab: (tab: Tab) => void; onPlus: () => void
}) {
  const { reduceMotion, reduceTransparency } = useNavigationAccessibility()
  const tabs = [['board', 'board', copy.board], ['flow', 'flow', copy.flow], ['settings', 'settings', copy.settings]] as const
  const visible = tabs.filter(entry => !minimized || entry[0] === tab)
  const [width, setWidth] = useState(0)
  const slot = Math.max(0, width - 8) / visible.length
  const index = visible.findIndex(entry => entry[0] === tab)
  const x = useRef(new Animated.Value(0)).current
  const geometry = `${width}:${visible.length}`
  const previousGeometry = useRef(geometry)
  useEffect(() => {
    const target = Math.max(0, index) * slot
    if (reduceMotion || previousGeometry.current !== geometry) {
      previousGeometry.current = geometry
      x.stopAnimation()
      x.setValue(target)
      return
    }
    const animation = Animated.spring(x, { toValue: target, stiffness: 700, damping: 42, mass: 0.6, overshootClamping: true, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [geometry, index, slot, reduceMotion, x])
  const bottom = minimized ? barBottom + 4 : barBottom
  return <NavigationGlassGroup style={styles.host}>
    <NavigationMaterial testID="bottom-navigation" theme={theme} reduceTransparency={reduceTransparency} blurTarget={blurTarget}
      style={[styles.bar, minimized ? styles.compactBar : styles.fullBar, { bottom }]}>
      <View style={styles.segments} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && <Animated.View pointerEvents="none" testID="tab-selection" style={[styles.selection, {
          width: slot, backgroundColor: reduceTransparency ? theme.hover : theme.scheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(80,72,62,0.09)',
          transform: [{ translateX: x }],
        }]} />}
        {visible.map(([id, icon, label]) => <Pressable key={id} testID={`app-tab-${id}`} accessibilityRole="tab" accessibilityLabel={label}
          accessibilityState={{ selected: id === tab }} aria-selected={id === tab} onPress={() => onTab(id)} style={({ pressed }) => [styles.tab, pressed && { backgroundColor: theme.hover }]}>
          <Icon name={icon} size={minimized ? 22 : 20} color={id === tab ? theme.focus : theme.fgSoft} />
          {!minimized && <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: id === tab ? theme.focus : theme.fgSoft }]}>{label}</Text>}
        </Pressable>)}
      </View>
    </NavigationMaterial>
    <NavigationMaterial testID="capture-material" theme={theme} reduceTransparency={reduceTransparency} blurTarget={blurTarget}
      style={[styles.capture, minimized && styles.compactCapture, { bottom }]}>
      <Pressable testID="capture-open" accessibilityRole="button" accessibilityLabel={copy.capture} onPress={onPlus}
        style={({ pressed }) => [styles.capturePress, pressed && { backgroundColor: theme.hover }]}>
        <Icon name="add" size={minimized ? 26 : 30} color={theme.fg} />
      </Pressable>
    </NavigationMaterial>
  </NavigationGlassGroup>
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  bar: { position: 'absolute', left: 16, height: TAB_HEIGHT, borderRadius: 31 },
  fullBar: { right: 86 }, compactBar: { width: 62, height: 52, borderRadius: 26 },
  segments: { flex: 1, flexDirection: 'row', padding: 4 },
  selection: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 27 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 27, gap: 2, minHeight: 44 },
  label: { fontSize: 10.5, fontWeight: '600' },
  capture: { position: 'absolute', right: 16, width: 62, height: 62, borderRadius: 31 },
  compactCapture: { width: 52, height: 52, borderRadius: 26 },
  capturePress: { flex: 1, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
})
