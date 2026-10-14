import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BOARD_COLUMNS, FLOW_INDENT, LONG_PRESS_MS, NEST_INDENT, SHEET_GRABBER, buildParentOrder, canNest, classifyPointer, columnMenuDismiss, columnMenuIndex, columnSections,
  columnRange, completionLabel, currentPeriod, dropOnRows, flowColors, flowLeftLinks, flowSections, flowStroke, linkHost, mayLink, neighborsAfterRemoval, nextHorizon, orderFlowItems,
  pageFromOffset, periodMeta, precedingPeriod, sheetRelease, shouldDragSheet, showBreakpoint, type AiConnection, type CalendarConfig, type CaptureDraft, type DevicePrefs, type DropTarget, type Horizon, type Notice,
  type ItemRow, type Period,   type LocaleId, type PeriodHorizon, type RowBox, type Snapshot,
} from '@goalloom/local-store'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import Svg, { Line } from 'react-native-svg'
import { Composer } from './composer'
import type { Copy } from './copy'
import { CheckBox, Icon } from './icons'
import type { Theme } from './theme'

export type Sheet =
  | { kind: 'detail'; id: string } | { kind: 'composer'; horizon?: Horizon } | { kind: 'backlog'; horizon: PeriodHorizon }
  | { kind: 'menu'; id: string } | { kind: 'add'; horizon: Horizon; periodId: string | null; parentId?: string | null; nestingParentId?: string | null }
  | { kind: 'move'; id: string } | { kind: 'due'; id: string } | { kind: 'parent'; id: string }
  | { kind: 'period'; horizon: PeriodHorizon }
  | { kind: 'trash' } | { kind: 'done' } | { kind: 'links' } | { kind: 'export'; json: string }
  | { kind: 'language' } | { kind: 'columns' } | { kind: 'check' } | { kind: 'style' } | { kind: 'celebrate' }
  | null

const languageNames: Record<LocaleId, string> = { zh: '中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
const MENU_DOT = { light: '#e08a2f', dark: '#f0a24a' }

function menuTick() {
  void Haptics.selectionAsync().catch(() => undefined)
}
const previous: Partial<Record<PeriodHorizon, PeriodHorizon>> = { half: 'year', cycle: 'half', month: 'cycle', week: 'month', day: 'week' }
const CONFETTI = ['#F5BA35', '#EE715B', '#E16EAA', '#8874DE', '#55A9E3', '#46B8A0', '#F2D77B']

function checkboxFill(theme: Theme, checkStyle: Snapshot['checkStyle'], done: boolean, tint: string | null): string {
  if (done) return theme.checked
  if (checkStyle === 'outline') return 'none'
  if (checkStyle === 'tint') return tint ?? theme.raised
  return theme.checkFill
}

function ink(theme: Theme): ViewStyle & { color: string } {
  return {
    color: theme.fg,
    backgroundColor: theme.raised,
    borderColor: theme.style === 'minimal' ? theme.line : theme.edge,
    borderWidth: theme.style === 'minimal' ? 1 : StyleSheet.hairlineWidth,
    borderRadius: theme.controlRadius,
  }
}

function surface(theme: Theme, radius: number): ViewStyle {
  const minimal = theme.style === 'minimal'
  return {
    backgroundColor: theme.raised,
    borderColor: minimal ? theme.line : theme.edge,
    borderWidth: minimal ? 1 : StyleSheet.hairlineWidth,
    borderRadius: radius,
    ...(minimal ? { elevation: 0 } : { shadowColor: theme.scheme === 'dark' ? '#000' : '#3c2814', shadowOpacity: theme.scheme === 'dark' ? 0.35 : 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 1 }, elevation: 1 }),
  }
}
const TAB_HEIGHT = 62
const scrollInset = { contentInsetAdjustmentBehavior: 'never' as const }

function chrome(bottomInset: number): { barBottom: number; contentBottom: number } {
  const barBottom = Math.max(bottomInset, 16)
  return { barBottom, contentBottom: barBottom + TAB_HEIGHT + 20 }
}

const SheetScrollY = createContext<RefObject<number> | null>(null)

function SheetScrollView({ children }: { children: ReactNode }) {
  const scrollY = useContext(SheetScrollY)
  useEffect(() => {
    if (scrollY) scrollY.current = 0
    return () => { if (scrollY) scrollY.current = 0 }
  }, [scrollY])
  return <ScrollView {...scrollInset} bounces={false} scrollEventThrottle={16} onScroll={event => { if (scrollY) scrollY.current = event.nativeEvent.contentOffset.y }}>{children}</ScrollView>
}

function BottomSheet({ theme, paddingBottom, onDismiss, children }: { theme: Theme; paddingBottom: number; onDismiss: () => void; children: ReactNode }) {
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
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.6 }).start()
    }
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
    <Animated.View ref={host} collapsable={false} onLayout={measure} {...pan.panHandlers} style={[styles.sheet, { backgroundColor: theme.surface, borderTopLeftRadius: theme.sheetRadius, borderTopRightRadius: theme.sheetRadius, paddingBottom, transform: [{ translateY }] }]}>
      <View style={styles.grabHit} {...grabber.panHandlers}>
        <View style={[styles.grab, { backgroundColor: theme.line }]} />
      </View>
      {children}
    </Animated.View>
  </SheetScrollY.Provider>
}

export function Goalloom({ copy, theme, snap, prefs, locale, tab, column, minimized, sheet, toast, shot, viewed, captureSeed, ai, onOpenAi, onTab, onColumn, onMinimize, onSheet, onDismissToast, onCheck, onTrash, onMove, onNest, onReorder, onCreate, onEdit, onFlow, onLink, onUnlink, onPolicy, onAppearance, onBackup, onPrefs, onUndo, onRestore, onViewPeriod, activity, periodsAround }: {
  copy: Copy; theme: Theme; snap: Snapshot; prefs: DevicePrefs; locale: LocaleId; tab: 'board' | 'flow' | 'settings'; column: number; minimized: boolean; sheet: Sheet
  ai: AiConnection | null; onOpenAi: () => void
  toast: Notice | null; shot: string
  viewed: Partial<Record<PeriodHorizon, Period>>; captureSeed: string
  onTab: (tab: 'board' | 'flow' | 'settings') => void; onColumn: (index: number) => void; onMinimize: (value: boolean) => void; onSheet: (sheet: Sheet) => void
  onDismissToast: () => void; onCheck: (item: ItemRow) => void; onTrash: (id: string) => void
  onMove: (id: string, horizon: Horizon) => void; onNest: (id: string, parentId: string) => void; onReorder: (id: string, beforeId: string | null, afterId: string | null) => void
  onCreate: (drafts: CaptureDraft[], periodId?: string | null) => boolean; onEdit: (id: string, fields: { title?: string; description?: string; dueDate?: string | null }) => void
  onFlow: (id: string, color: number | null) => void; onLink: (parentId: string, childId: string) => void; onUnlink: (parentId: string, childId: string) => void
  onPolicy: (horizon: PeriodHorizon, mode: 'auto' | 'manual') => void; onAppearance: (fields: { theme?: Theme['scheme'] | 'system'; style?: 'paper' | 'minimal'; checkStyle?: 'outline' | 'paper' | 'tint' }) => void
  onBackup: () => void; onPrefs: (prefs: DevicePrefs) => void; onUndo: () => void; onRestore: (id: string) => void
  onViewPeriod: (horizon: PeriodHorizon, period: Period | null) => void
  activity: (id: string) => { type: string; at: string }[]; periodsAround: (horizon: PeriodHorizon) => Period[]
}) {
  const insets = useSafeAreaInsets()
  const { barBottom, contentBottom } = chrome(insets.bottom)
  const columns = BOARD_COLUMNS.filter(horizon => horizon === 'later' ? prefs.later : prefs.columns[horizon])
  const scheme = theme.scheme
  const nodes = useMemo(() => new Map(snap.items.map(item => [item.id, { id: item.id, flowColor: item.flowColor, nestingParentId: item.nestingParentId, horizon: item.horizon, status: item.status }])), [snap.items])
  const order = useMemo(() => buildParentOrder(snap.items.map(item => ({
    id: item.id, horizon: item.horizon, periodId: item.periodId, sortKey: item.sortKey, nestingParentId: item.nestingParentId,
    periodStart: null, periodEnd: snap.periods[item.horizon as PeriodHorizon]?.endAt ?? null,
  })), snap.relations, snap.now), [snap])
  const hide = shot === 'empty' || shot === 'emptycol'
  const reduce = useRef(false)
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reduce.current = value })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduce.current = value })
    return () => sub.remove()
  }, [])
  const celebrate = (item: ItemRow) => {
    if (item.status !== 'done' && prefs.celebration[item.horizon] && !reduce.current) setBurst(value => value + 1)
    onCheck(item)
  }
  const lastY = useRef(0)
  const scroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y
    if (y > lastY.current && y > 24) onMinimize(true)
    else if (y < 8 || y < lastY.current - 8) onMinimize(false)
    lastY.current = y
  }
  return <View style={[styles.app, { backgroundColor: theme.bg, paddingTop: Platform.OS === 'web' ? 47 : insets.top }]}>
    {tab === 'board' && <Board copy={copy} theme={theme} locale={locale} snap={snap} columns={columns} column={column} hide={hide} shot={shot} viewed={viewed} nodes={nodes} contentBottom={contentBottom} {...(prefs.parentOrder ? { compare: order.compare } : {})} onColumn={onColumn} onSheet={onSheet} onCheck={celebrate} onNest={onNest} onReorder={onReorder} onScroll={scroll} />}
    {tab === 'flow' && <Flow copy={copy} theme={theme} snap={snap} prefs={prefs} nodes={nodes} shot={shot} contentBottom={contentBottom} onSheet={onSheet} onCheck={celebrate} onScroll={scroll} />}
    {tab === 'settings' && <Settings copy={copy} theme={theme} snap={snap} prefs={prefs} locale={locale} ai={ai} contentBottom={contentBottom} onSheet={onSheet} onOpenAi={onOpenAi} onPolicy={onPolicy} onAppearance={onAppearance} onBackup={onBackup} onPrefs={onPrefs} onScroll={scroll} />}
    <TabBar copy={copy} theme={theme} tab={tab} minimized={minimized || shot === 'min' || shot === 'mindark'} barBottom={barBottom} onTab={onTab} onPlus={() => onSheet({ kind: 'composer', horizon: columns[column] ?? 'day' })} />
    {toast && <View style={[styles.toast, theme.style === 'minimal' ? { ...surface(theme, theme.controlRadius), bottom: barBottom + TAB_HEIGHT + 12 } : { backgroundColor: theme.fg, borderRadius: 22, bottom: barBottom + TAB_HEIGHT + 12 }]}>
      <View style={styles.flex}>
        <Text style={{ color: theme.style === 'minimal' ? theme.fg : theme.onAccent }}>{toast.text}</Text>
        {toast.detail ? <Text style={{ color: theme.style === 'minimal' ? theme.secondary : theme.onAccent, opacity: theme.style === 'minimal' ? 1 : 0.75, fontSize: 12, marginTop: 2 }}>{toast.detail}</Text> : null}
      </View>
      {toast.undo && <Pressable onPress={onUndo}><Text style={{ color: theme.focus, fontWeight: '700' }}>{copy.undo}</Text></Pressable>}
      <Pressable onPress={onDismissToast} accessibilityLabel={copy.close} hitSlop={8}><Icon name="close" size={16} color={theme.style === 'minimal' ? theme.secondary : theme.onAccent} /></Pressable>
    </View>}
    {sheet && <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={() => onSheet(null)} />}
    {sheet?.kind === 'menu' ? <Menu copy={copy} theme={theme} item={snap.items.find(item => item.id === sheet.id) ?? snap.trash.find(item => item.id === sheet.id)} onSheet={onSheet} onCheck={celebrate} onTrash={onTrash} onMove={onMove} /> : sheet && sheet.kind !== 'composer' && <BottomSheet theme={theme} paddingBottom={Math.max(insets.bottom, 16) + 12} onDismiss={() => onSheet(null)}>
      <SheetBody copy={copy} theme={theme} snap={snap} prefs={prefs} locale={locale} sheet={sheet} scheme={scheme} nodes={nodes} onSheet={onSheet} onCreate={onCreate} onEdit={onEdit} onFlow={onFlow} onLink={onLink} onUnlink={onUnlink} onMove={onMove} onTrash={onTrash} onRestore={onRestore} onPolicy={onPolicy} onAppearance={onAppearance} onBackup={onBackup} onPrefs={onPrefs} onViewPeriod={onViewPeriod} activity={activity} periodsAround={periodsAround} onCheck={celebrate} />
    </BottomSheet>}
    {sheet?.kind === 'composer' && <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.composerHost} pointerEvents="box-none">
      <Composer copy={copy} theme={theme} snap={snap} seed={captureSeed} horizon={sheet.horizon ?? columns[column] ?? 'day'} columns={columns} bottom={Math.max(insets.bottom, 8)} onCreate={onCreate} onDismiss={() => onSheet(null)} />
    </KeyboardAvoidingView>}
    <Confetti token={burst} />
  </View>
}

function Board({ copy, theme, locale, snap, columns, column, hide, shot, viewed, nodes, contentBottom, compare, onColumn, onSheet, onCheck, onNest, onReorder, onScroll }: {
  copy: Copy; theme: Theme; locale: LocaleId; snap: Snapshot; columns: readonly Horizon[]; column: number; hide: boolean; shot: string
  viewed: Partial<Record<PeriodHorizon, Period>>
  nodes: Map<string, { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }>
  contentBottom: number
  compare?: (a: string, b: string) => number
  onColumn: (index: number) => void; onSheet: (sheet: Sheet) => void; onCheck: (item: ItemRow) => void
  onNest: (id: string, parentId: string) => void; onReorder: (id: string, beforeId: string | null, afterId: string | null) => void
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const layouts = useRef(new Map<string, { y: number; height: number }>())
  const tops = useRef<Partial<Record<Horizon, number>>>({})
  const scrolls = useRef<Partial<Record<Horizon, number>>>({})
  const drop = useRef<DropTarget | null>(null)
  const orders = useRef<Partial<Record<Horizon, string[]>>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [nestUnder, setNestUnder] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState<Partial<Record<Horizon, boolean>>>({})
  const [menu, setMenu] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const anchorY = useRef(0)
  const armed = useRef(false)
  const entered = useRef(false)
  const hoverRef = useRef<number | null>(null)
  const columnRef = useRef(column)
  columnRef.current = column
  const [pageWidth, setPageWidth] = useState(0)
  const [pageHeight, setPageHeight] = useState(0)
  const [headerHeight, setHeaderHeight] = useState(56)
  const pager = useRef<ScrollView>(null)
  const fromPager = useRef(false)
  const pagerReady = useRef(false)
  const boxesFor = (childId: string, horizon: Horizon): RowBox[] => (orders.current[horizon] ?? []).flatMap(id => {
    const box = layouts.current.get(id)
    if (!box) return []
    const y = (tops.current[horizon] ?? 0) + box.y - (scrolls.current[horizon] ?? 0)
    return [{ id, y, height: box.height, canNest: canNest(childId, id, nodes, snap.relations) }]
  })
  const follow = (id: string, pageY: number) => {
    const item = snap.items.find(row => row.id === id)
    if (!item) return
    const rows = boxesFor(id, item.horizon)
    const target = dropOnRows(rows, pageY)
    drop.current = target
    setDragId(id)
    setNestUnder(target.kind === 'nest' ? target.parentId : null)
  }
  const finish = (id: string) => {
    const target = drop.current
    const item = snap.items.find(row => row.id === id)
    setDragId(null)
    setNestUnder(null)
    drop.current = null
    if (!target) return
    if (target.kind === 'nest') onNest(id, target.parentId)
    else {
      const neighbors = neighborsAfterRemoval(item ? orders.current[item.horizon] ?? [] : [], id, target.index)
      onReorder(id, neighbors.beforeId, neighbors.afterId)
    }
  }
  const horizon = columns[column] ?? 'day'
  useEffect(() => {
    if (pageWidth <= 0) return
    if (fromPager.current) { fromPager.current = false; return }
    pager.current?.scrollTo({ x: column * pageWidth, animated: pagerReady.current })
    pagerReady.current = true
  }, [column, pageWidth])
  const settle = (x: number) => {
    const next = pageFromOffset(x, pageWidth, columns.length)
    if (next === column) return
    fromPager.current = true
    hoverRef.current = null
    setHover(null)
    setMenu(false)
    onColumn(next)
  }
  const pick = (index: number) => {
    setHover(null)
    hoverRef.current = null
    setMenu(false)
    if (index !== column) onColumn(index)
  }
  const closeMenu = () => { setHover(null); hoverRef.current = null; setMenu(false) }
  const rememberAnchor = (bottom: number) => { anchorY.current = bottom + 4 }
  const moveHover = (y: number) => {
    if (!armed.current) return
    const index = columnMenuIndex(y, anchorY.current, columns.length)
    if (index !== null) entered.current = true
    if (index === hoverRef.current) return
    hoverRef.current = index
    setHover(index)
    if (index !== null) menuTick()
  }
  const releaseHover = (y: number) => {
    if (!armed.current) return
    armed.current = false
    const index = columnMenuIndex(y, anchorY.current, columns.length)
    const dragged = entered.current
    entered.current = false
    hoverRef.current = null
    setHover(null)
    if (index !== null) pick(index)
    else if (dragged) closeMenu()
  }
  const pickRef = useRef(pick)
  const closeRef = useRef(closeMenu)
  const countRef = useRef(columns.length)
  pickRef.current = pick
  closeRef.current = closeMenu
  countRef.current = columns.length
  const dismissPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (gesture.dy < -12 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) || (Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (columnMenuDismiss(gesture.dy, gesture.dx)) { closeRef.current(); return }
      if (Math.abs(gesture.dx) > 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
        const next = columnRef.current + (gesture.dx < 0 ? 1 : -1)
        if (next >= 0 && next < countRef.current) pickRef.current(next)
      }
    },
  })).current
  const shown = hover === null ? horizon : columns[hover] ?? horizon
  const shownPeriod = shown === 'later' ? null : viewed[shown] ?? snap.periods[shown] ?? null
  return <View style={styles.flex}>
    <BoardTitle copy={copy} theme={theme} locale={locale} horizon={shown} period={shownPeriod} calendar={snap.calendar} today={snap.today} current={shown === 'later' ? null : snap.periods[shown] ?? null} open={menu} onPress={() => { if (menu) closeMenu(); else setMenu(true) }} onArm={() => { armed.current = true; entered.current = false; setMenu(true) }} onMove={moveHover} onRelease={releaseHover} onLayout={height => { setHeaderHeight(height) }} onAnchor={rememberAnchor} />
    <View style={styles.flex} onLayout={event => { setPageWidth(event.nativeEvent.layout.width); setPageHeight(event.nativeEvent.layout.height) }}>
      {pageWidth > 0 && pageHeight > 0 && <ScrollView ref={pager} horizontal pagingEnabled directionalLockEnabled nestedScrollEnabled scrollEnabled={!dragId && !menu} showsHorizontalScrollIndicator={false} style={styles.flex} onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.x)}>
        {columns.map(page => {
          const pagePeriod = page === 'later' ? null : viewed[page] ?? snap.periods[page] ?? null
          const sections = hide && (shot === 'empty' || page === 'week') ? { todo: [], done: [] } : columnSections(snap.items.filter(item => item.horizon === page && (page === 'later' || item.periodId === pagePeriod?.id) && item.status !== 'cancelled'), compare)
          const outline = [...sections.todo, ...sections.done]
          const visible = [...sections.todo, ...(doneOpen[page] ? sections.done : [])]
          const open = !!doneOpen[page]
          const backlog = snap.backlog.filter(item => item.horizon === page).length
          const manual = page !== 'later' && snap.policies[page] === 'manual'
          const prev = page === 'later' ? undefined : previous[page]
          const sources = prev ? snap.items.filter(item => item.horizon === prev && item.status === 'todo' && item.periodId === snap.periods[prev]?.id && !snap.relations.some(edge => edge.parentId === item.id && snap.items.some(child => child.id === edge.childId && child.horizon === page))) : []
          return <View key={page} style={{ width: pageWidth, height: pageHeight }} onLayout={event => {
            const node = event.target as unknown as { measureInWindow?: (callback: (x: number, y: number) => void) => void } | null
            if (node && typeof node.measureInWindow === 'function') node.measureInWindow((_x, y) => { tops.current[page] = y })
          }}>
            <ScrollView style={styles.flex} scrollEnabled={!dragId} nestedScrollEnabled onScroll={event => { scrolls.current[page] = event.nativeEvent.contentOffset.y; if (page === horizon) onScroll(event) }} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: contentBottom }} {...scrollInset}>
              {manual && backlog > 0 && <Pressable onPress={() => onSheet({ kind: 'backlog', horizon: page })} style={styles.entry}><Text style={{ color: theme.secondary }}>{copy.backlog(backlog)}</Text><Icon name="next" size={14} color={theme.faint} /></Pressable>}
              {outline.length === 0 ? <Empty copy={copy} theme={theme} horizon={page} sources={sources.length} onDraft={() => onSheet({ kind: 'composer', horizon: page })} onWrite={() => onSheet({ kind: 'add', horizon: page, periodId: pagePeriod?.id ?? null })} /> : <>
                {sections.todo.map(item => {
                  return <View key={item.id} onLayout={event => { layouts.current.set(item.id, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }); orders.current[page] = visible.map(row => row.id) }}>
                    <Row item={item} copy={copy} theme={theme} nested={!!item.nestingParentId && outline.some(row => row.id === item.nestingParentId)} lifted={dragId === item.id || (shot === 'drag' && item.title === '整理读书笔记')} onCheck={() => onCheck(item)} onOpen={() => onSheet({ kind: 'detail', id: item.id })} onMenu={() => onSheet({ kind: 'menu', id: item.id })} onDrag={(y) => follow(item.id, y)} onDrop={() => finish(item.id)} today={snap.today} checkStyle={snap.checkStyle} tint={rowTint(item.id, nodes, snap.relations, theme.scheme)} />
                    {(nestUnder === item.id || (shot === 'drag' && item.title === '周三 10km 节奏跑')) && <View style={[styles.nestLine, { backgroundColor: theme.focus, marginLeft: 20 + NEST_INDENT }]} />}
                  </View>
                })}
                {sections.done.length > 0 && <Pressable onPress={() => setDoneOpen(current => ({ ...current, [page]: !current[page] }))} style={styles.fold} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                  <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="next" size={14} color={theme.secondary} /></View>
                  <Text style={{ color: theme.secondary, fontSize: 13 }}>{copy.doneFold(Number(completionLabel('fold', sections.done.filter(entry => entry.status === 'done').length, sections.done.length)))}</Text>
                </Pressable>}
                {open && sections.done.map(item => {
                  return <View key={item.id} onLayout={event => { layouts.current.set(item.id, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }); orders.current[page] = visible.map(row => row.id) }}>
                    <Row item={item} copy={copy} theme={theme} nested={!!item.nestingParentId && outline.some(row => row.id === item.nestingParentId)} lifted={dragId === item.id || (shot === 'drag' && item.title === '整理读书笔记')} onCheck={() => onCheck(item)} onOpen={() => onSheet({ kind: 'detail', id: item.id })} onMenu={() => onSheet({ kind: 'menu', id: item.id })} onDrag={(y) => follow(item.id, y)} onDrop={() => finish(item.id)} today={snap.today} checkStyle={snap.checkStyle} tint={rowTint(item.id, nodes, snap.relations, theme.scheme)} />
                    {(nestUnder === item.id || (shot === 'drag' && item.title === '周三 10km 节奏跑')) && <View style={[styles.nestLine, { backgroundColor: theme.focus, marginLeft: 20 + NEST_INDENT }]} />}
                  </View>
                })}
              </>}
            </ScrollView>
          </View>
        })}
      </ScrollView>}
    </View>
    {menu && <>
      <View style={[styles.menuScrim, { top: headerHeight, backgroundColor: theme.scheme === 'dark' ? 'rgba(0,0,0,0.12)' : 'rgba(40,25,10,0.05)' }]} {...dismissPan.panHandlers}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      </View>
      <View style={[styles.columnMenu, { top: headerHeight + 4, borderColor: theme.line }]}>
        <BlurView intensity={theme.style === 'minimal' ? 40 : 80} tint={theme.scheme === 'dark' ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { backgroundColor: theme.scheme === 'dark' ? 'rgba(36,32,28,0.62)' : 'rgba(255,253,250,0.72)' }]} />
        {columns.map((page, index) => {
          const pagePeriod = page === 'later' ? null : viewed[page] ?? snap.periods[page] ?? null
          const label = columnLabel(copy, locale, page, pagePeriod, snap.calendar, snap.today, page === 'later' ? null : snap.periods[page] ?? null)
          const open = hide && (shot === 'empty' || page === 'week') ? 0 : snap.items.filter(item => item.horizon === page && (page === 'later' || item.periodId === pagePeriod?.id) && item.status === 'todo').length
          return <Pressable key={page} onPress={() => pick(index)} accessibilityRole="menuitem" accessibilityState={{ selected: index === column }} style={[styles.columnRow, hover === index && { backgroundColor: theme.hover }]}>
            <View style={styles.menuDot}>{index === column && <View style={[styles.menuMark, { backgroundColor: MENU_DOT[theme.scheme] }]} />}</View>
            <Text numberOfLines={1} style={[styles.menuName, { color: theme.fg }]}>{label.title}</Text>
            <Text numberOfLines={1} style={[styles.menuRange, { color: theme.secondary }]}>{label.range}</Text>
            <Text style={[styles.menuCount, { color: theme.secondary }]}>{open}</Text>
          </Pressable>
        })}
      </View>
    </>}
  </View>
}

function columnLabel(copy: Copy, locale: LocaleId, horizon: Horizon, period: Period | null, calendar: CalendarConfig | null, today: string, current: Period | null): { title: string; range: string } {
  if (horizon === 'later' || !period) return { title: copy.later, range: '' }
  const title = horizon === 'year' ? period.startDate.slice(0, 4) : copy[horizon]
  return { title, range: columnRange(horizon, period, calendar, today, locale, headingRelative(horizon, period, calendar, current)) }
}

/** Current, previous, and next headings keep year digits off, except a rolling cycle that is not current. Matches the desktop column header. */
function headingRelative(horizon: Horizon, period: Period, calendar: CalendarConfig | null, current: Period | null): boolean {
  if (!calendar || !current?.startAt || !current.endAt) return true
  if (period.id === current.id) return true
  if (horizon === 'later') return true
  if (horizon === 'cycle' && calendar.mode !== 'natural') return false
  try {
    if (precedingPeriod(calendar, current)?.id === period.id) return true
    return currentPeriod(calendar, horizon, current.endAt).id === period.id
  } catch { return false }
}

function BoardTitle({ copy, theme, locale, horizon, period, calendar, today, current, open, onPress, onArm, onMove, onRelease, onLayout, onAnchor }: {
  copy: Copy; theme: Theme; locale: LocaleId; horizon: Horizon; period: Period | null; calendar: CalendarConfig | null; today: string; current: Period | null
  open: boolean; onPress: () => void; onArm: () => void; onMove: (y: number) => void; onRelease: (y: number) => void
  onLayout: (height: number) => void
  onAnchor: (bottom: number) => void
}) {
  const label = columnLabel(copy, locale, horizon, period, calendar, today, current)
  const node = useRef<View>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armed = useRef(false)
  const consumed = useRef(false)
  const begin = () => {
    armed.current = false
    consumed.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { armed.current = true; onArm() }, LONG_PRESS_MS)
  }
  const end = (y: number) => {
    if (timer.current) clearTimeout(timer.current)
    if (armed.current) { consumed.current = true; onRelease(y) }
    armed.current = false
  }
  const place = (height: number) => {
    onLayout(height)
    node.current?.measureInWindow((_x, y, _width, measured) => onAnchor(y + measured))
  }
  return <View ref={node} style={styles.header} onLayout={event => place(event.nativeEvent.layout.height)}>
    <Pressable onPress={() => { if (consumed.current) { consumed.current = false; return } onPress() }} onPressIn={begin} onPressOut={event => end(event.nativeEvent.pageY)} onTouchMove={event => { if (armed.current) onMove(event.nativeEvent.pageY) }} style={styles.titlePress} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text numberOfLines={1} style={[styles.periodTitle, { color: theme.fg }]}>{label.title}</Text>
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="down" size={14} color={theme.faint} /></View>
    </Pressable>
    {!!label.range && <Text numberOfLines={1} style={[styles.range, { color: theme.secondary }]}>{label.range}</Text>}
  </View>
}

function rowTint(id: string, nodes: Map<string, { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }>, edges: Snapshot['relations'], scheme: Theme['scheme']): string | null {
  const color = flowColors(id, nodes, edges)[0]
  return color === undefined ? null : flowStroke(color, scheme)
}

function Row({ item, copy, theme, nested, lifted, onCheck, onOpen, onMenu, onDrag, onDrop, today, checkStyle, tint }: {
  item: ItemRow; copy: Copy; theme: Theme; nested: boolean; lifted: boolean
  onCheck: () => void; onOpen: () => void; onMenu: () => void; onDrag: (pageY: number) => void; onDrop: () => void; today: string; checkStyle: Snapshot['checkStyle']; tint: string | null
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phase = useRef<'pending' | 'scroll' | 'paging' | 'drag' | 'menu'>('pending')
  const origin = useRef({ x: 0, y: 0, t: 0 })
  const dragging = useRef(false)
  const fill = checkboxFill(theme, checkStyle, item.status === 'done', tint)
  const ring = item.status !== 'done' && checkStyle === 'tint' && tint ? [tint] : []
  const note = item.note
  const progress = note?.tasks ? completionLabel('note', note.tasks.done, note.tasks.total) : null
  const words = note?.tasks ? note.next : note?.excerpt
  const begin = (x: number, y: number) => {
    origin.current = { x, y, t: Date.now() }
    phase.current = 'pending'
    dragging.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (phase.current === 'pending') { phase.current = 'menu'; onMenu() }
    }, LONG_PRESS_MS)
  }
  const move = (x: number, y: number) => {
    const next = classifyPointer(x - origin.current.x, y - origin.current.y, Date.now() - origin.current.t)
    if (phase.current === 'pending' && (next === 'paging' || next === 'scroll')) {
      phase.current = next
      if (timer.current) clearTimeout(timer.current)
    }
    if (next === 'drag' && phase.current !== 'paging' && phase.current !== 'scroll') {
      phase.current = 'drag'
      dragging.current = true
      if (timer.current) clearTimeout(timer.current)
      onDrag(y)
    }
  }
  const end = () => {
    if (timer.current) clearTimeout(timer.current)
    if (dragging.current) onDrop()
    dragging.current = false
    phase.current = 'pending'
  }
  return <Pressable onPress={onOpen} onPressIn={event => begin(event.nativeEvent.pageX, event.nativeEvent.pageY)} onPressOut={end} onTouchMove={event => move(event.nativeEvent.pageX, event.nativeEvent.pageY)}
    style={[styles.row, nested && { paddingLeft: 20 + NEST_INDENT }, theme.style === 'minimal' && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }, lifted && { transform: [{ translateY: -28 }, { scale: 1.02 }], backgroundColor: theme.raised, borderRadius: theme.rowRadius, zIndex: lifted ? 2 : 0 }]}>
    <Pressable onPress={onCheck} hitSlop={11} style={styles.checkHit}><CheckBox done={item.status === 'done'} strokes={ring} fill={fill} edge={theme.checkEdge} checked={theme.checked} /></Pressable>
    <View style={styles.flex}>
      <View style={styles.titleLine}>
        <Text style={[styles.title, { color: item.status === 'done' ? theme.secondary : theme.fg, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }]}>{item.title}</Text>
        <DueMark item={item} copy={copy} theme={theme} today={today} />
      </View>
      {note && <View style={styles.noteRow}>
        {progress && <Text style={[styles.note, { color: theme.secondary }]}>{progress}</Text>}
        {note.links[0] && <Text style={[styles.note, { color: theme.secondary }]}>{linkHost(note.links[0])}</Text>}
        {!!words && <Text numberOfLines={1} style={[styles.note, styles.flex, { color: theme.secondary }]}>{words}</Text>}
      </View>}
    </View>
  </Pressable>
}

function shortDue(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

function DueMark({ item, copy, theme, today, flush = false }: { item: ItemRow; copy: Copy; theme: Theme; today: string; flush?: boolean }) {
  const overdue = item.status !== 'done' && !!item.dueDate && item.dueDate < today
  if (!item.dueDate || item.status === 'done') return null
  return <View style={[styles.dueSlot, !flush && styles.dueSlotLine]} accessibilityRole={overdue ? 'image' : undefined} accessibilityLabel={overdue ? copy.overdue(shortDue(item.dueDate)) : undefined}>
    {overdue ? <Icon name="overdue" size={16} color={theme.danger} /> : <Text style={[styles.due, { color: theme.secondary }]}>{shortDue(item.dueDate)}</Text>}
  </View>
}

function Empty({ copy, theme, horizon, sources, onDraft, onWrite }: { copy: Copy; theme: Theme; horizon: Horizon; sources: number; onDraft: () => void; onWrite: () => void }) {
  return <View style={styles.empty}>
    <Icon name="later" size={42} color={theme.faint} strokeWidth={1.2} />
    <Text style={[styles.emptyTitle, { color: theme.fg }]}>{copy.emptyTitle(copy[horizon])}</Text>
    {sources > 0 && <View style={styles.rowGap}>
      <Pressable style={[styles.button, { backgroundColor: theme.hover, borderRadius: theme.controlRadius }]} onPress={onDraft}><Text style={{ color: theme.fg, fontWeight: '600' }}>{copy.draft}</Text></Pressable>
      <Pressable style={[styles.button, { backgroundColor: theme.hover, borderRadius: theme.controlRadius }]} onPress={onWrite}><Text style={{ color: theme.fg, fontWeight: '600' }}>{copy.own}</Text></Pressable>
    </View>}
  </View>
}

function Flow({ copy, theme, snap, prefs, nodes, shot, contentBottom, onSheet, onCheck, onScroll }: {
  copy: Copy; theme: Theme; snap: Snapshot; prefs: DevicePrefs
  nodes: Map<string, { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }>
  shot: string; contentBottom: number; onSheet: (sheet: Sheet) => void; onCheck: (item: ItemRow) => void
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const roots = snap.items.filter(item => item.flowColor !== null && !item.nestingParentId)
  const [root, setRoot] = useState<string | null>(null)
  const chosen = roots.find(item => item.id === root)
  const items = orderFlowItems(snap.items.filter(item => item.horizon !== 'later' && item.status !== 'cancelled' && (root === null || item.id === root || (chosen?.flowColor !== null && chosen && flowColors(item.id, nodes, snap.relations).includes(chosen.flowColor!))))
    .map(item => ({ ...item, horizon: item.horizon as PeriodHorizon })))
  const sections = flowSections(items.map(item => ({ id: item.id, horizon: item.horizon as PeriodHorizon, done: item.status === 'done' })))
  const railItems = items.map(item => ({ id: item.id, horizon: item.horizon as PeriodHorizon, done: item.status === 'done', color: flowColors(item.id, nodes, snap.relations)[0] ?? null }))
  const nesting = items.flatMap(item => item.nestingParentId ? [{ parentId: item.nestingParentId, childId: item.id }] : [])
  const links = flowLeftLinks(railItems, [...snap.relations, ...nesting])
  const tops = useRef(new Map<string, { y: number; height: number }>())
  const [, painted] = useState(0)
  const list = useRef<ScrollView>(null)
  const stick = () => { if (shot === 'flowsticky') list.current?.scrollTo({ y: 980, animated: false }) }
  useEffect(() => { stick() }, [shot])
  const place = (id: string, y: number, height: number) => {
    const prev = tops.current.get(id)
    if (prev && prev.y === y && prev.height === height) return
    tops.current.set(id, { y, height })
    painted(value => value + 1)
  }
  const blocks: ReactNode[] = []
  const sticky: number[] = []
  const height = [...tops.current.values()].reduce((max, box) => Math.max(max, box.y + box.height), 0)
  if (prefs.relationLines) blocks.push(<Svg key="rail" width={40} height={height} style={styles.rail} pointerEvents="none">
    {links.map(link => {
      const from = tops.current.get(link.from)
      const to = tops.current.get(link.to)
      if (!from || !to) return null
      const color = link.color === null ? theme.faint : flowStroke(link.color, theme.scheme)
      return <Line key={`${link.from}-${link.to}`} x1={25} y1={from.y + from.height / 2} x2={25} y2={to.y + to.height / 2} stroke={color} strokeWidth={1.5} strokeOpacity={link.dim ? 0.3 : 0.6} {...(link.skip ? { strokeDasharray: '3 4' } : {})} />
    })}
  </Svg>)
  blocks.push(<View key="flow-head">
    <Text style={[styles.screenTitle, { color: theme.fg }]}>{copy.flow}</Text>
    <ScrollView horizontal style={styles.chipStrip} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} {...scrollInset}>
      <Pressable onPress={() => setRoot(null)} style={[styles.flowChip, { borderRadius: theme.controlRadius, backgroundColor: root === null ? theme.fg : theme.hover }]}><Text style={{ color: root === null ? theme.onAccent : theme.secondary }}>{copy.all}</Text></Pressable>
      {roots.map(item => <Pressable key={item.id} onPress={() => setRoot(item.id)} style={[styles.flowChip, { borderRadius: theme.controlRadius, backgroundColor: root === item.id ? theme.fg : theme.hover }]}>
        <View style={[styles.dot, styles.dotChip, { backgroundColor: item.flowColor === null ? theme.faint : flowStroke(item.flowColor, theme.scheme) }]} />
        <Text numberOfLines={1} style={{ color: root === item.id ? theme.onAccent : theme.fg, maxWidth: 180 }}>{item.title}</Text>
      </Pressable>)}
    </ScrollView>
  </View>)
  for (const section of sections) {
    const headerStat = completionLabel('header', section.ids.length, section.ids.length)
    sticky.push(blocks.length)
    blocks.push(<View key={`h-${section.horizon}`} collapsable={false} style={[styles.flowHeader, { backgroundColor: theme.bg, zIndex: 1 }]}><View style={styles.gutter} /><Text style={[styles.flowHeaderText, { color: theme.fg }]}>{copy[section.horizon]}{headerStat ? ` ${headerStat}` : ''}</Text></View>)
    for (const id of section.ids) {
      const item = items.find(row => row.id === id)
      if (!item) continue
      const color = flowColors(item.id, nodes, snap.relations)[0]
      const progress = item.note?.tasks ? completionLabel('note', item.note.tasks.done, item.note.tasks.total) : null
      const tint = color === undefined ? null : flowStroke(color, theme.scheme)
      blocks.push(<Pressable key={item.id} onPress={() => onSheet({ kind: 'detail', id: item.id })} onLayout={event => place(item.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)} style={[styles.flowRow, { paddingLeft: FLOW_INDENT }, theme.style === 'minimal' && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }]}>
        <View style={[styles.gutter, styles.gutterCenter]}>
          <View style={[styles.dot, styles.dotChip, { backgroundColor: color === undefined ? theme.faint : flowStroke(color, theme.scheme) }]} />
        </View>
        <Pressable onPress={() => onCheck(item)} hitSlop={10}><CheckBox done={item.status === 'done'} strokes={snap.checkStyle === 'tint' && tint ? [tint] : []} fill={checkboxFill(theme, snap.checkStyle, item.status === 'done', tint)} edge={theme.checkEdge} checked={theme.checked} /></Pressable>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: item.status === 'done' ? theme.secondary : theme.fg, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }]}>{item.title}</Text>
          {progress && <Text style={[styles.note, { color: theme.secondary }]}>{progress}</Text>}
        </View>
        <DueMark item={item} copy={copy} theme={theme} today={snap.today} flush />
      </Pressable>)
    }
  }
  return <ScrollView ref={list} stickyHeaderIndices={sticky} onScroll={onScroll} scrollEventThrottle={16} onContentSizeChange={stick} contentContainerStyle={{ paddingBottom: contentBottom }} {...scrollInset}>
    {blocks}
  </ScrollView>
}

function Settings({ copy, theme, snap, prefs, locale, ai, contentBottom, onSheet, onOpenAi, onPolicy, onAppearance, onBackup, onPrefs, onScroll }: {
  copy: Copy; theme: Theme; snap: Snapshot; prefs: DevicePrefs; locale: LocaleId; ai: AiConnection | null; contentBottom: number; onSheet: (sheet: Sheet) => void; onOpenAi: () => void
  onPolicy: (horizon: PeriodHorizon, mode: 'auto' | 'manual') => void
  onAppearance: (fields: { theme?: 'system' | 'light' | 'dark'; style?: 'paper' | 'minimal'; checkStyle?: 'outline' | 'paper' | 'tint' }) => void
  onBackup: () => void; onPrefs: (prefs: DevicePrefs) => void; onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const visible = BOARD_COLUMNS.filter(horizon => horizon === 'later' ? prefs.later : prefs.columns[horizon]).length
  const doneCount = snap.items.filter(item => item.status === 'done').length
  const celebrating = BOARD_COLUMNS.some(horizon => prefs.celebration[horizon])
  const localeName = languageNames[prefs.locale ?? locale]
  const check = snap.checkStyle === 'outline' ? copy.outline : snap.checkStyle === 'tint' ? copy.tint : copy.paper
  return <ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: contentBottom }} {...scrollInset}>
    <Text style={[styles.screenTitle, { color: theme.fg }]}>{copy.settings}</Text>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.appearance}</Text>
    <Card theme={theme}>
      <Field theme={theme} label={copy.language} value={localeName} onPress={() => onSheet({ kind: 'language' })} />
      <Field theme={theme} label={copy.style} value={snap.style === 'paper' ? copy.paper : copy.minimal} onPress={() => onSheet({ kind: 'style' })} />
      <Field theme={theme} label={copy.check} value={check} onPress={() => onSheet({ kind: 'check' })} />
      <View style={styles.themeRow}>
        <Text style={{ color: theme.fg }}>{copy.themeLabel}</Text>
        <View style={[styles.themeSegment, { backgroundColor: theme.hover }]}>
          {(['system', 'light', 'dark'] as const).map(mode => <Pressable key={mode} onPress={() => onAppearance({ theme: mode })} style={[styles.themeSegmentItem, { borderRadius: Math.max(4, theme.controlRadius - 2) }, snap.theme === mode && { backgroundColor: theme.style === 'minimal' ? theme.bg : theme.raised, ...(theme.style === 'minimal' ? { borderWidth: 1, borderColor: theme.line } : {}) }]}><Text style={{ color: theme.fg, fontSize: 12 }}>{copy[mode]}</Text></Pressable>)}
        </View>
      </View>
      <Field theme={theme} label={copy.lines} value={prefs.relationLines ? copy.on : copy.off} onPress={() => onPrefs({ ...prefs, relationLines: !prefs.relationLines })} />
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.ai}</Text>
    <Card theme={theme}>
      <Field theme={theme} label={copy.aiService} value={ai ? copy.start.aiProviders[ai.provider] : copy.disconnected} onPress={onOpenAi} />
      <Field theme={theme} label={copy.smart} value={copy.local} onPress={() => undefined} />
      <Field theme={theme} label={copy.insight} value={prefs.showInsight ? copy.on : copy.off} onPress={() => onPrefs({ ...prefs, showInsight: !prefs.showInsight })} />
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.boardSection}</Text>
    <Card theme={theme}>
      <Field theme={theme} label={copy.parentOrder} value={prefs.parentOrder ? copy.on : copy.off} onPress={() => onPrefs({ ...prefs, parentOrder: !prefs.parentOrder })} />
      <Field theme={theme} label={copy.celebration} value={celebrating ? copy.on : copy.off} onPress={() => onSheet({ kind: 'celebrate' })} />
      <Field theme={theme} label={copy.columns} value={String(visible)} onPress={() => onSheet({ kind: 'columns' })} />
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.calendar}</Text>
    <Card theme={theme}>
      {(['year', 'half', 'cycle', 'month', 'week', 'day'] as const).map(horizon => <View key={horizon} style={styles.field}>
        <Text style={{ color: theme.fg, flex: 1 }}>{copy[horizon]} · {copy.overduePolicy}</Text>
        <View style={[styles.segment, { backgroundColor: theme.hover }]}>
          {(['auto', 'manual'] as const).map(mode => <Pressable key={mode} onPress={() => onPolicy(horizon, mode)} style={[styles.segmentItem, snap.policies[horizon] === mode && { backgroundColor: theme.raised }]}><Text style={{ color: theme.fg, fontSize: 12 }}>{copy[mode]}</Text></Pressable>)}
        </View>
      </View>)}
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.backup}</Text>
    <Card theme={theme}>
      <Field theme={theme} label={copy.backupDaily} value={snap.backupEnabled ? copy.on : copy.off} onPress={onBackup} />
      <Field theme={theme} label={copy.exportJson} value="" onPress={() => onSheet({ kind: 'export', json: JSON.stringify({ items: snap.items.map(item => ({ id: item.id, title: item.title, horizon: item.horizon, dueDate: item.dueDate, status: item.status })) }, null, 2) })} />
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.items}</Text>
    <Card theme={theme}>
      <Field theme={theme} label={copy.doneItems} value={String(doneCount)} onPress={() => onSheet({ kind: 'done' })} />
      <Field theme={theme} label={copy.trashCan} value={String(snap.trash.length)} onPress={() => onSheet({ kind: 'trash' })} />
    </Card>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.about}</Text>
    <Card theme={theme}><Field theme={theme} label="Goalloom" value={copy.version} onPress={() => undefined} /></Card>
  </ScrollView>
}

function Card({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <View style={[styles.card, surface(theme, theme.cardRadius), { overflow: 'visible' }]}>{children}</View>
}
function Field({ theme, label, value, onPress, disabled = false, valueColor }: { theme: Theme; label: string; value: string; onPress: () => void; disabled?: boolean; valueColor?: string }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.field, disabled && { opacity: 0.45 }]}><Text style={{ color: theme.fg, flex: 1 }}>{label}</Text><Text style={{ color: valueColor ?? theme.secondary }}>{value}{disabled ? '' : ' ›'}</Text></Pressable>
}

function TabBar({ copy, theme, tab, minimized, barBottom, onTab, onPlus }: { copy: Copy; theme: Theme; tab: 'board' | 'flow' | 'settings'; minimized: boolean; barBottom: number; onTab: (tab: 'board' | 'flow' | 'settings') => void; onPlus: () => void }) {
  const tabs = [['board', 'board', copy.board], ['flow', 'flow', copy.flow], ['settings', 'settings', copy.settings]] as const
  const bottom = minimized ? barBottom + 4 : barBottom
  return <View pointerEvents="box-none" style={styles.tabs}>
    <View style={[styles.bar, minimized ? styles.barMin : styles.barPlus, { bottom, borderColor: theme.style === 'minimal' ? theme.line : theme.edge, borderWidth: theme.style === 'minimal' ? 1 : StyleSheet.hairlineWidth }]}>
      <BlurView intensity={theme.style === 'minimal' ? 28 : 72} tint={theme.scheme === 'dark' ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { backgroundColor: theme.style === 'minimal' ? (theme.scheme === 'dark' ? 'rgba(9,9,11,0.82)' : 'rgba(255,255,255,0.82)') : (theme.scheme === 'dark' ? 'rgba(43,38,33,0.45)' : 'rgba(255,253,250,0.45)') }]} />
      {tabs.filter((entry) => !minimized || entry[0] === tab).map(([id, icon, label]) => <Pressable key={id} onPress={() => onTab(id)} style={[styles.tab, id === tab && { backgroundColor: theme.hover }]}>
        <Icon name={icon} size={minimized ? 22 : 20} color={id === tab ? theme.focus : theme.fgSoft} />
        {!minimized && <Text style={{ fontSize: 10.5, fontWeight: '600', color: id === tab ? theme.focus : theme.fgSoft }}>{label}</Text>}
      </Pressable>)}
    </View>
    <Pressable onPress={onPlus} style={[styles.plus, minimized && styles.plusMin, { bottom }]} accessibilityLabel={copy.capture}><Icon name="add" size={minimized ? 26 : 30} color="#fbf9f6" /></Pressable>
  </View>
}

function Menu({ copy, theme, item, onSheet, onCheck, onTrash, onMove }: { copy: Copy; theme: Theme; item: ItemRow | undefined; onSheet: (sheet: Sheet) => void; onCheck: (item: ItemRow) => void; onTrash: (id: string) => void; onMove: (id: string, horizon: Horizon) => void }) {
  if (!item) return null
  const next = nextHorizon(item.horizon)
  const rows: [string, () => void][] = [
    [item.status === 'done' ? copy.reopen : copy.complete, () => { onCheck(item); onSheet(null) }],
    [copy.move, () => onSheet({ kind: 'move', id: item.id })],
    [copy.toLater, () => { onMove(item.id, 'later'); onSheet(null) }],
    [copy.due, () => onSheet({ kind: 'due', id: item.id })],
    [copy.parent, () => onSheet({ kind: 'parent', id: item.id })],
    [copy.decompose, () => { if (next) onSheet({ kind: 'add', horizon: next, periodId: null, parentId: item.id }); else onSheet(null) }],
    [copy.drag, () => onSheet(null)],
  ]
  return <View style={[styles.menu, surface(theme, theme.cardRadius)]}>
    {rows.map(([label, press]) => <Pressable key={label} onPress={press} style={styles.menuRow}><Text style={{ color: theme.fg, fontSize: 15 }}>{label}</Text></Pressable>)}
    <Pressable onPress={() => { onTrash(item.id); onSheet(null) }} style={styles.menuRow}><Text style={{ color: theme.danger, fontSize: 15 }}>{copy.trash}</Text></Pressable>
  </View>
}

function SheetBody(props: {
  copy: Copy; theme: Theme; snap: Snapshot; prefs: DevicePrefs; locale: LocaleId; sheet: Exclude<Sheet, null>; scheme: Theme['scheme']
  nodes: Map<string, { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }>
  onSheet: (sheet: Sheet) => void; onCreate: (drafts: CaptureDraft[], periodId?: string | null) => boolean
  onEdit: (id: string, fields: { title?: string; description?: string; dueDate?: string | null }) => void
  onFlow: (id: string, color: number | null) => void; onLink: (parentId: string, childId: string) => void; onUnlink: (parentId: string, childId: string) => void
  onMove: (id: string, horizon: Horizon) => void; onTrash: (id: string) => void; onRestore: (id: string) => void
  onPolicy: (horizon: PeriodHorizon, mode: 'auto' | 'manual') => void
  onAppearance: (fields: { theme?: 'system' | 'light' | 'dark'; style?: 'paper' | 'minimal'; checkStyle?: 'outline' | 'paper' | 'tint' }) => void
  onBackup: () => void
  onPrefs: (prefs: DevicePrefs) => void
  onViewPeriod: (horizon: PeriodHorizon, period: Period | null) => void
  activity: (id: string) => { type: string; at: string }[]; periodsAround: (horizon: PeriodHorizon) => Period[]
  onCheck: (item: ItemRow) => void
}) {
  const { copy, theme, snap, sheet, onSheet } = props
  const item = 'id' in sheet ? snap.items.find(row => row.id === sheet.id) ?? snap.trash.find(row => row.id === sheet.id) : undefined
  if (sheet.kind === 'detail' && item) return <Detail key={item.id} {...props} item={item} />
  if (sheet.kind === 'composer') return null
  if (sheet.kind === 'backlog') return <Backlog {...props} horizon={sheet.horizon} />
  if (sheet.kind === 'add') return <Add {...props} horizon={sheet.horizon} periodId={sheet.periodId} parentId={sheet.parentId ?? null} nestingParentId={sheet.nestingParentId ?? null} />
  if (sheet.kind === 'move' && item) return <View>{BOARD_COLUMNS.filter(horizon => props.prefs.later || horizon !== 'later').map(horizon => <Pressable key={horizon} onPress={() => { props.onMove(item.id, horizon); onSheet(null) }} style={styles.menuRow}><Text style={{ color: theme.fg }}>{copy[horizon]}</Text></Pressable>)}</View>
  if (sheet.kind === 'due' && item) return <Due {...props} item={item} />
  if (sheet.kind === 'parent' && item) return <View>{snap.items.filter(row => mayLink(row.horizon, item.horizon)).map(row => <Pressable key={row.id} onPress={() => { props.onLink(row.id, item.id); onSheet({ kind: 'detail', id: item.id }) }} style={styles.menuRow}><Text style={{ color: theme.fg }}>{row.title}</Text></Pressable>)}</View>
  if (sheet.kind === 'period') return <View>
    <Pressable onPress={() => { props.onViewPeriod(sheet.horizon, null); onSheet(null) }} style={styles.menuRow}><Text style={{ color: theme.focus }}>{copy.periodBack}</Text></Pressable>
    {props.periodsAround(sheet.horizon).map(period => <Pressable key={period.id} onPress={() => { props.onViewPeriod(sheet.horizon, period); onSheet(null) }} style={styles.menuRow}><Text style={{ color: theme.fg }}>{periodMeta(sheet.horizon, period, snap.today).meta}</Text></Pressable>)}
  </View>
  if (sheet.kind === 'trash') return <View>{snap.trash.length === 0 ? <Text style={{ color: theme.secondary }}>{copy.emptyTrash}</Text> : snap.trash.map(row => <View key={row.id} style={styles.field}><Text style={{ color: theme.fg, flex: 1 }}>{row.title}</Text><Pressable onPress={() => props.onRestore(row.id)}><Text style={{ color: theme.focus }}>{copy.restore}</Text></Pressable></View>)}</View>
  if (sheet.kind === 'done') {
    const rows = snap.items.filter(row => row.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return <SheetScrollView>{rows.length === 0 ? <Text style={{ color: theme.secondary }}>{copy.emptyDone}</Text> : rows.map(row => <Pressable key={row.id} onPress={() => onSheet({ kind: 'detail', id: row.id })} style={styles.field}><Text style={{ color: theme.fg, flex: 1 }}>{row.title}</Text><Text style={{ color: theme.secondary }}>{copy[row.horizon]}</Text></Pressable>)}</SheetScrollView>
  }
  if (sheet.kind === 'links') {
    const links = snap.items.flatMap(row => row.note?.links.map(url => ({ url, title: row.title })) ?? [])
    return <View>{links.length === 0 ? <Text style={{ color: theme.secondary }}>{copy.linkNone}</Text> : links.map(link => <Text key={link.url + link.title} style={{ color: theme.fg, marginVertical: 6 }}>{linkHost(link.url)}</Text>)}</View>
  }
  if (sheet.kind === 'export') return <Text selectable style={{ color: theme.fg }}>{sheet.json}</Text>
  if (sheet.kind === 'language') {
    const current = props.prefs.locale ?? props.locale
    return <View>{(['zh', 'en', 'ja', 'es', 'fr'] as const).map(id => <Choice key={id} theme={theme} label={languageNames[id]} selected={id === current} onPress={() => { props.onPrefs({ ...props.prefs, locale: id }); onSheet(null) }} />)}</View>
  }
  if (sheet.kind === 'columns') return <View>{BOARD_COLUMNS.map(horizon => {
    const on = horizon === 'later' ? props.prefs.later : props.prefs.columns[horizon]
    return <Choice key={horizon} theme={theme} label={copy[horizon]} selected={on} onPress={() => props.onPrefs({ ...props.prefs, later: horizon === 'later' ? !props.prefs.later : props.prefs.later, columns: horizon === 'later' ? props.prefs.columns : { ...props.prefs.columns, [horizon]: !props.prefs.columns[horizon] } })} />
  })}</View>
  if (sheet.kind === 'check') return <View>{(['outline', 'paper', 'tint'] as const).map(style => <Choice key={style} theme={theme} label={style === 'outline' ? copy.outline : style === 'paper' ? copy.paper : copy.tint} selected={snap.checkStyle === style} onPress={() => { props.onAppearance({ checkStyle: style }); onSheet(null) }} />)}</View>
  if (sheet.kind === 'style') return <View>{(['paper', 'minimal'] as const).map(style => <Choice key={style} theme={theme} label={style === 'paper' ? copy.paper : copy.minimal} selected={snap.style === style} onPress={() => { props.onAppearance({ style }); onSheet(null) }} />)}</View>
  if (sheet.kind === 'celebrate') return <View>{BOARD_COLUMNS.map(horizon => <Choice key={horizon} theme={theme} label={copy[horizon]} selected={props.prefs.celebration[horizon]} onPress={() => props.onPrefs({ ...props.prefs, celebration: { ...props.prefs.celebration, [horizon]: !props.prefs.celebration[horizon] } })} />)}</View>
  return null
}

function Detail(props: { copy: Copy; theme: Theme; snap: Snapshot; item: ItemRow; nodes: Map<string, { id: string; flowColor: number | null; nestingParentId: string | null; horizon: Horizon; status: string }>; onSheet: (sheet: Sheet) => void; onEdit: (id: string, fields: { title?: string; description?: string; dueDate?: string | null }) => void; onFlow: (id: string, color: number | null) => void; onCheck: (item: ItemRow) => void; activity: (id: string) => { type: string; at: string }[] }) {
  const { copy, theme, snap, item, onSheet, onEdit } = props
  const parent = item.nestingParentId ? snap.items.find(row => row.id === item.nestingParentId) : undefined
  const parents = snap.relations.filter(edge => edge.childId === item.id).map(edge => snap.items.find(row => row.id === edge.parentId)?.title).filter((title): title is string => !!title)
  const colors = flowColors(item.id, props.nodes, snap.relations)
  const subs = snap.items.filter(row => row.nestingParentId === item.id)
  const names: Record<string, string> = { created: copy.activityCreated, moved: copy.activityMoved, status_changed: copy.activityStatus, deleted: copy.activityDeleted, item_restored: copy.activityRestored, nesting_changed: copy.activityNest, edited: copy.activityEdit, rolled_over: copy.activityRoll, undo: copy.undo }
  const step = showBreakpoint(item.id, props.nodes, snap.relations) ? nextHorizon(item.horizon) : null
  return <SheetScrollView>
    <View style={styles.titleLine}>
      <Pressable onPress={() => props.onCheck(item)} hitSlop={8}><CheckBox done={item.status === 'done'} strokes={item.status === 'done' ? [] : colors.map(index => flowStroke(index, theme.scheme))} fill={checkboxFill(theme, snap.checkStyle, item.status === 'done', colors[0] === undefined ? null : flowStroke(colors[0], theme.scheme))} edge={theme.checkEdge} checked={theme.checked} /></Pressable>
      <TextInput defaultValue={item.title} onEndEditing={event => onEdit(item.id, { title: event.nativeEvent.text })} style={[styles.detailTitle, { color: theme.fg }]} />
    </View>
    {parent && <Field theme={theme} label={copy.belongs} value={parent.title} onPress={() => onSheet({ kind: 'detail', id: parent.id })} />}
    <Field theme={theme} label={copy.column} value={copy[item.horizon]} onPress={() => onSheet({ kind: 'move', id: item.id })} />
    <Field theme={theme} label={copy.due} value={item.dueDate ? `${shortDue(item.dueDate)}${item.status !== 'done' && item.dueDate < snap.today ? copy.overdueSuffix : ''}` : copy.noDue} {...(item.status !== 'done' && item.dueDate && item.dueDate < snap.today ? { valueColor: theme.danger } : {})} onPress={() => onSheet({ kind: 'due', id: item.id })} />
    {step && <Pressable onPress={() => onSheet({ kind: 'add', horizon: step, periodId: null, parentId: item.id })} style={styles.menuRow}><Text style={{ color: theme.focus, fontWeight: '600' }}>＋ {copy.nextStep}</Text></Pressable>}
    <Field theme={theme} label={copy.parent} value={parent ? copy.follows(parent.title) : parents.join(' · ') || copy.noParent} onPress={() => onSheet({ kind: 'parent', id: item.id })} />
    <Field theme={theme} label={copy.flowField} value={parent ? copy.followsParent : colors.length ? colors.map(index => snap.items.find(row => row.flowColor === index)?.title ?? '').filter(Boolean).join(' · ') : copy.noParent} onPress={() => undefined} />
    {!parent && item.horizon !== 'later' && <View style={styles.rowGap}>{[0, 1, 2, 3, 4, 5, 6, 7].map(index => <Pressable key={index} onPress={() => props.onFlow(item.id, item.flowColor === index ? null : index)} style={[styles.swatch, { backgroundColor: flowStroke(index, theme.scheme) }]} />)}</View>}
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.description}</Text>
    <TextInput multiline defaultValue={item.description} placeholder={copy.describe} placeholderTextColor={theme.faint} onEndEditing={event => onEdit(item.id, { description: event.nativeEvent.text })} style={[styles.desc, ink(theme)]} />
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.subtasks}</Text>
    {subs.map(sub => <Pressable key={sub.id} onPress={() => onSheet({ kind: 'detail', id: sub.id })} style={styles.menuRow}><Text style={{ color: theme.fg }}>{sub.title}</Text></Pressable>)}
    <Pressable onPress={() => onSheet({ kind: 'add', horizon: item.horizon, periodId: item.periodId, nestingParentId: item.id })} style={styles.menuRow}><Text style={{ color: theme.focus }}>{copy.addSub}</Text></Pressable>
    <Text style={[styles.section, { color: theme.secondary }]}>{copy.activity}</Text>
    {props.activity(item.id).map((event, index) => <Text key={index} style={{ color: theme.secondary, marginVertical: 2 }}>{names[event.type] ?? event.type} · {event.at.slice(5, 10)}</Text>)}
  </SheetScrollView>
}

function Backlog({ copy, theme, snap, horizon, onMove, onSheet }: { copy: Copy; theme: Theme; snap: Snapshot; horizon: PeriodHorizon; onMove: (id: string, horizon: Horizon) => void; onSheet: (sheet: Sheet) => void }) {
  const rows = snap.backlog.filter(item => item.horizon === horizon)
  const [picked, setPicked] = useState<string[]>(() => rows.map(row => row.id))
  return <View>
    <Text style={[styles.detailTitle, { color: theme.fg }]}>{copy.backlogTitle(copy[horizon])}</Text>
    {rows.map(row => <Pressable key={row.id} onPress={() => setPicked(picked.includes(row.id) ? picked.filter(id => id !== row.id) : [...picked, row.id])} style={styles.field}>
      <View style={[styles.dot, { backgroundColor: picked.includes(row.id) ? theme.focus : 'transparent', borderWidth: 1.5, borderColor: theme.focus }]} />
      <View style={styles.flex}><Text style={{ color: theme.fg }}>{row.title}</Text>{!!row.dueDate && <Text style={{ color: theme.secondary }}>{shortDue(row.dueDate)}</Text>}</View>
    </Pressable>)}
    <Text style={{ color: theme.secondary }}>{copy.selected(picked.length)}</Text>
    <View style={styles.rowGap}>
      <Pressable style={[styles.button, styles.flex, { backgroundColor: theme.hover }]} onPress={() => { picked.forEach(id => onMove(id, 'later')); onSheet(null) }}><Text style={{ textAlign: 'center', color: theme.fg, fontWeight: '700' }}>{copy.toLater}</Text></Pressable>
      <Pressable style={[styles.button, styles.flex, { backgroundColor: theme.fg }]} onPress={() => { picked.forEach(id => onMove(id, 'day')); onSheet(null) }}><Text style={{ textAlign: 'center', color: theme.onAccent, fontWeight: '700' }}>{copy.moveToday}</Text></Pressable>
    </View>
  </View>
}

function Add({ copy, theme, horizon, periodId, parentId, nestingParentId, onCreate, onSheet }: { copy: Copy; theme: Theme; horizon: Horizon; periodId: string | null; parentId: string | null; nestingParentId: string | null; onCreate: (drafts: CaptureDraft[], periodId?: string | null) => boolean; onSheet: (sheet: Sheet) => void }) {
  const [title, setTitle] = useState('')
  return <View>
    <TextInput value={title} onChangeText={setTitle} placeholder={copy.addTitle} placeholderTextColor={theme.faint} style={[styles.desc, ink(theme)]} />
    <Pressable style={[styles.button, { backgroundColor: theme.fg }]} onPress={() => { if (!title.trim()) { onSheet(null); return }; if (onCreate([{ title: title.trim(), horizon, dueDate: null, parentId, nestingParentId }], periodId)) onSheet(null) }}><Text style={{ color: theme.onAccent, fontWeight: '700', textAlign: 'center' }}>{copy.add}</Text></Pressable>
  </View>
}

function Choice({ theme, label, selected, onPress }: { theme: Theme; label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.languageRow}>
    <Text style={{ color: theme.fg, flex: 1, fontSize: 16, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    {selected && <Icon name="check" size={18} color={theme.fg} />}
  </Pressable>
}

function Confetti({ token }: { token: number }) {
  const progress = useRef(new Animated.Value(0)).current
  const [pieces, setPieces] = useState<{ side: 1 | -1; x: number; y: number; w: number; h: number; color: string }[]>([])
  useEffect(() => {
    if (!token) return
    setPieces(Array.from({ length: 28 }, (_, index) => {
      const side: 1 | -1 = index < 14 ? 1 : -1
      const angle = (24 + (index % 14) * 4) * Math.PI / 180
      const speed = 100 + (index * 19) % 150
      return { side, x: Math.cos(angle) * speed * side, y: -Math.sin(angle) * speed * 1.35, w: 5 + (index % 4), h: 8 + (index % 5), color: CONFETTI[index % CONFETTI.length]! }
    }))
    progress.setValue(0)
    const anim = Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    anim.start(({ finished }) => { if (finished) setPieces([]) })
    return () => anim.stop()
  }, [token, progress])
  if (pieces.length === 0) return null
  return <View pointerEvents="none" style={styles.confetti}>
    {pieces.map((piece, index) => {
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, piece.x] })
      const translateY = progress.interpolate({ inputRange: [0, 0.62, 1], outputRange: [0, piece.y, piece.y + 140] })
      const opacity = progress.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] })
      return <Animated.View key={`${token}-${index}`} style={{ position: 'absolute', bottom: 18, ...(piece.side === 1 ? { left: 8 } : { right: 8 }), width: piece.w, height: piece.h, borderRadius: 1, backgroundColor: piece.color, opacity, transform: [{ translateX }, { translateY }] }} />
    })}
  </View>
}

function Due({ copy, theme, item, onEdit, onSheet }: { copy: Copy; theme: Theme; item: ItemRow; snap: Snapshot; onEdit: (id: string, fields: { dueDate?: string | null }) => void; onSheet: (sheet: Sheet) => void }) {
  const [value, setValue] = useState(item.dueDate ?? '')
  return <View>
    <TextInput value={value} onChangeText={setValue} placeholder="YYYY-MM-DD" placeholderTextColor={theme.faint} style={[styles.desc, ink(theme)]} />
    <Pressable onPress={() => { onEdit(item.id, { dueDate: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }); onSheet({ kind: 'detail', id: item.id }) }} style={styles.menuRow}><Text style={{ color: theme.fg }}>{copy.confirm}</Text></Pressable>
    <Pressable onPress={() => { onEdit(item.id, { dueDate: null }); onSheet({ kind: 'detail', id: item.id }) }} style={styles.menuRow}><Text style={{ color: theme.secondary }}>{copy.noDue}</Text></Pressable>
  </View>
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  flex: { flex: 1 },
  chipStrip: { flexGrow: 0 },
  strip: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2, gap: 4, alignItems: 'center' },
  header: { minHeight: 52, paddingLeft: 20, paddingRight: 16, paddingTop: 2, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  titlePress: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  periodTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  range: { fontSize: 15, lineHeight: 20, marginBottom: 5, flexShrink: 1 },
  menuScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4 },
  columnMenu: { position: 'absolute', left: 20, width: 260, zIndex: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', shadowColor: '#3c2814', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  columnRow: { height: 40, paddingRight: 12, flexDirection: 'row', alignItems: 'center' },
  menuDot: { width: 16, alignItems: 'center' },
  menuMark: { width: 7, height: 7, borderRadius: 4 },
  menuName: { width: 84, fontSize: 16 },
  menuRange: { flex: 1, fontSize: 15 },
  menuCount: { minWidth: 18, marginLeft: 8, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'] },
  entry: { marginLeft: 20, height: 30, flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { minHeight: 44, paddingVertical: 5, paddingRight: 16, paddingLeft: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fold: { height: 40, paddingLeft: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkHit: { marginTop: 6 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15, lineHeight: 22, paddingVertical: 6 },
  dueSlot: { height: 28, justifyContent: 'center' },
  dueSlotLine: { marginTop: 6 },
  due: { fontSize: 12, fontVariant: ['tabular-nums'] },
  noteRow: { flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 4, alignItems: 'center' },
  note: { fontSize: 12 },
  nestLine: { height: 2, marginRight: 12, borderRadius: 2 },
  empty: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  rowGap: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: 28, fontWeight: '700', marginHorizontal: 20, marginTop: 8, letterSpacing: -0.3 },
  flowChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8 },
  flowHeader: { height: 40, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flowHeaderText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  flowRow: { minHeight: 44, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12 },
  gutter: { width: 18, alignSelf: 'stretch', alignItems: 'center' },
  gutterCenter: { justifyContent: 'center' },
  flowLine: { position: 'absolute', top: 22, bottom: -22, borderLeftWidth: 1.5 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  dotChip: { marginTop: 0 },
  rail: { position: 'absolute', left: 0, top: 0 },
  section: { marginTop: 18, marginBottom: 6, marginHorizontal: 20, fontSize: 13, fontWeight: '600' },
  card: { marginHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  field: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  themeRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  themeSegment: { flexDirection: 'row', borderRadius: 7, padding: 2 },
  themeSegmentItem: { flex: 1, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 5 },
  segment: { flexDirection: 'row', borderRadius: 7, padding: 2 },
  segmentItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  bar: { position: 'absolute', left: 16, height: 62, borderRadius: 31, flexDirection: 'row', padding: 4, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  barPlus: { right: 86 },
  barMin: { width: 62, height: 52, right: undefined },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 27, gap: 2 },
  plus: { position: 'absolute', right: 16, width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b2621' },
  plusMin: { width: 52, height: 52 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 108, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  confetti: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  composerHost: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 18, paddingBottom: 28 },
  grabHit: { height: SHEET_GRABBER, alignItems: 'center', justifyContent: 'center' },
  grab: { width: 36, height: 5, borderRadius: 3 },
  menu: { position: 'absolute', left: 48, top: 280, width: 230, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  menuRow: { paddingHorizontal: 14, paddingVertical: 12 },
  languageRow: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailTitle: { fontSize: 20, fontWeight: '600', flex: 1 },
  desc: { minHeight: 72, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, fontSize: 15 },
  preview: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginBottom: 8, gap: 4 },
  swatch: { width: 22, height: 22, borderRadius: 6 },
})
