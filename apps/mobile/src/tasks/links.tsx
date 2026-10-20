/**
 * [INPUT]: Saved HTTP(S) destinations and localized task copy.
 * [OUTPUT]: Deduplicated offline source cards and explicit system-browser navigation.
 * [POS]: Mobile presentation only. It never fetches metadata or changes saved task text.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { linkHost } from '@goalloom/local-store'
import type { Copy } from '../copy'
import { Icon } from '../icons'
import type { Theme } from '../theme'

export function savedLinks(text: string): string[] {
  const urls = new Set<string>()
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`\u3000。，、；：！？「」『』【】《》“”‘’]+/giu)) {
    let value = match[0].replace(/[.,;:!?]+$/u, '')
    for (const [close, open] of [[')', '('], [']', '['], ['}', '{']] as const) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1)
    }
    try {
      const url = new URL(value)
      if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password && !value.includes('\\') && url.href.length <= 4096) urls.add(url.href)
    } catch { /* Malformed destinations remain plain task text. */ }
  }
  return [...urls]
}

export function TaskLinkPreviews({ text, theme, copy }: { text: string; theme: Theme; copy: Copy }) {
  const urls = savedLinks(text), track = useRef<ScrollView>(null)
  const [width, setWidth] = useState(240), [index, setIndex] = useState(0), [failed, setFailed] = useState(false)
  const multiple = urls.length > 1
  if (!urls.length) return null
  const step = (direction: number) => {
    const next = Math.max(0, Math.min(urls.length - 1, index + direction))
    setIndex(next); track.current?.scrollTo({ x: next * (width + 10), animated: false })
  }
  return <View style={styles.previews} onLayout={event => setWidth(Math.max(140, event.nativeEvent.layout.width - (multiple ? 24 : 0)))}>
    <ScrollView ref={track} horizontal nestedScrollEnabled onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} showsHorizontalScrollIndicator={false} snapToInterval={width + 10} decelerationRate="fast"
      onScroll={event => setIndex(Math.min(urls.length - 1, Math.round(event.nativeEvent.contentOffset.x / (width + 10))))} scrollEventThrottle={16} contentContainerStyle={styles.track}>
      {urls.map(url => <Pressable key={url} accessibilityRole="link" accessibilityLabel={`${copy.task.openLink}: ${url}`}
        onPress={() => { setFailed(false); void Linking.openURL(url).catch(() => setFailed(true)) }} style={[styles.card, { width, backgroundColor: theme.raised, borderColor: theme.line }]}>
        <View style={[styles.thumbnail, { backgroundColor: theme.hover }]}><Icon name="link" size={25} color={theme.secondary} /></View>
        <View style={styles.copy}><Text style={[styles.source, { color: theme.secondary }]}>{copy.task.savedLink}</Text><Text numberOfLines={2} style={[styles.title, { color: theme.fg }]}>{linkHost(url)}</Text><Text numberOfLines={2} style={[styles.url, { color: theme.secondary }]}>{url}</Text></View>
      </Pressable>)}
    </ScrollView>
    {multiple && <View style={styles.controls}><Text style={[styles.count, { color: theme.secondary }]}>{Math.min(index + 1, urls.length)} / {urls.length}</Text>
      <Pressable accessibilityRole="button" disabled={index === 0} accessibilityLabel={copy.task.previousLink} onPress={() => step(-1)} style={styles.step}><Icon name="back" size={18} color={index === 0 ? theme.faint : theme.fg} /></Pressable>
      <Pressable accessibilityRole="button" disabled={index >= urls.length - 1} accessibilityLabel={copy.task.nextLink} onPress={() => step(1)} style={styles.step}><Icon name="next" size={18} color={index >= urls.length - 1 ? theme.faint : theme.fg} /></Pressable>
    </View>}
    {failed && <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>{copy.task.linkFailed}</Text>}
  </View>
}

export function DescriptionLinks({ text, theme, copy }: { text: string; theme: Theme; copy: Copy }) {
  const [failed, setFailed] = useState(false)
  return <View>{savedLinks(text).map(url => <Pressable key={url} accessibilityRole="link" accessibilityLabel={`${copy.task.openLink}: ${url}`}
    onPress={() => { setFailed(false); void Linking.openURL(url).catch(() => setFailed(true)) }} style={styles.inline}>
    <Icon name="link" size={16} color={theme.focus} /><Text style={{ color: theme.focus, fontSize: 15, flexShrink: 1 }}>{linkHost(url)}</Text>
  </Pressable>)}{failed && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{copy.task.linkFailed}</Text>}</View>
}

const styles = StyleSheet.create({
  previews: { marginBottom: 7 }, track: { gap: 10 },
  card: { height: 128, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  thumbnail: { width: 48, height: 78, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 }, source: { fontSize: 11 }, title: { fontSize: 15, lineHeight: 20, fontWeight: '600', marginVertical: 4 }, url: { fontSize: 12, lineHeight: 16 },
  controls: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, count: { flex: 1, fontSize: 12 }, step: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
})
