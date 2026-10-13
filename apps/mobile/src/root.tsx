import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Platform, Pressable, Text, useColorScheme, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { randomUUID } from 'expo-crypto'
import {
  BOARD_COLUMNS, DEMO_NOW, LocalWorkspace, OPEN_COLUMN, StoreError, installDevice, installSchema,
  nearbyPeriods, readPrefs, seedDemo, writePrefs, type CaptureDraft, type DevicePrefs, type Horizon, type ItemRow,
  type LocaleId, type Period, type PeriodHorizon, type Snapshot, type UndoToken,
} from '@goalloom/local-store'
import { catalogs, systemLocale, type Copy } from './copy'
import { launchFromUrl, webLaunch, type Launch } from './launch'
import { openDatabase } from './storage'
import { themeFor, type Scheme } from './theme'
import { Goalloom, type Sheet } from './view'

const CAPTURE_SEED = '周五前订京都酒店，然后每天读 30 页'

interface Boot {
  store: LocalWorkspace
  device: Awaited<ReturnType<typeof openDatabase>>
  snap: Snapshot
  prefs: DevicePrefs
}

let useDemoClock = process.env.EXPO_PUBLIC_DEMO === '1'
let bootTail: Promise<unknown> = Promise.resolve()

function clock(): string {
  if (useDemoClock) return process.env.EXPO_PUBLIC_NOW || DEMO_NOW
  return new Date().toISOString()
}

function enqueueBoot(fn: () => Promise<Boot>): Promise<Boot> {
  const run = bootTail.then(fn, fn)
  bootTail = run.then(() => undefined, () => undefined)
  return run
}

async function openBoot(launch: Launch): Promise<Boot> {
  if (launch.demo) useDemoClock = true
  const demo = launch.demo
  const at = clock()
  const driver = await openDatabase(demo ? 'goalloom-demo' : 'goalloom', demo)
  const device = await openDatabase('goalloom-device', demo)
  installSchema(driver, 'mobile', at)
  installDevice(device)
  const store = new LocalWorkspace(driver, randomUUID)
  if (demo && !store.load(at).setupConfirmedAt) {
    store.confirm(at, { mode: 'natural', timezone: 'Asia/Shanghai', weekStart: 1 })
    seedDemo(store, at)
  }
  if (demo && launch.dark) store.setAppearance({ theme: 'dark' })
  let prefs = readPrefs(device)
  if (demo) {
    prefs = { ...prefs, locale: 'zh' }
    writePrefs(device, prefs)
  }
  return { store, device, snap: store.load(at), prefs }
}

function initialSheet(shot: string, items: ItemRow[]): Sheet {
  const id = (part: string) => items.find(item => item.title.includes(part))?.id
  if (shot === 'menu') { const item = id('评审'); return item ? { kind: 'menu', id: item } : null }
  if (shot === 'detail' || shot === 'detaildark') { const item = id('订京都酒店'); return item ? { kind: 'detail', id: item } : null }
  if (shot === 'sub') { const item = id('信息架构'); return item ? { kind: 'detail', id: item } : null }
  if (shot === 'capture') return { kind: 'composer' }
  if (shot === 'backlog') return { kind: 'backlog', horizon: 'day' }
  return null
}

function initialColumn(shot: string): number {
  const horizon: Horizon = shot === 'week' || shot === 'mid' || shot === 'drag' || shot === 'emptycol' || shot === 'sub' ? 'week'
    : shot === 'month' ? 'month' : shot === 'later' ? 'later' : OPEN_COLUMN
  const index = BOARD_COLUMNS.indexOf(horizon)
  return index < 0 ? BOARD_COLUMNS.indexOf(OPEN_COLUMN) : index
}

function initialTab(shot: string): 'board' | 'flow' | 'settings' {
  if (shot === 'flow' || shot === 'flowsticky') return 'flow'
  if (shot === 'settings') return 'settings'
  return 'board'
}

export default function Root() {
  const systemScheme = useColorScheme()
  const [boot, setBoot] = useState<Boot | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'board' | 'flow' | 'settings'>('board')
  const [column, setColumn] = useState(BOARD_COLUMNS.indexOf(OPEN_COLUMN))
  const [minimized, setMinimized] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<{ text: string; undo: UndoToken | null } | null>(null)
  const [viewed, setViewed] = useState<Partial<Record<PeriodHorizon, Period>>>({})
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [launch, setLaunch] = useState<Launch | null>(Platform.OS === 'web' ? webLaunch() : null)
  const launchRef = useRef(launch)
  launchRef.current = launch
  const shot = launch?.shot ?? ''
  const launchKey = launch ? `${launch.shot}\n${launch.demo}\n${launch.dark}` : ''

  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!__DEV__) {
      setLaunch(webLaunch())
      return
    }
    let cancelled = false
    const adopt = (url: string | null) => {
      setLaunch(current => {
        const base = current ?? webLaunch()
        if (!url) return base
        return launchFromUrl(url, base) ?? base
      })
    }
    void Linking.getInitialURL().then(url => { if (!cancelled) adopt(url) })
    const sub = Linking.addEventListener('url', event => adopt(event.url))
    return () => { cancelled = true; sub.remove() }
  }, [])

  useEffect(() => {
    const current = launchRef.current
    if (!current) return
    let cancelled = false
    void enqueueBoot(() => openBoot(current)).then(opened => {
      if (cancelled) return
      setBoot(opened)
      setError('')
      setTab(initialTab(current.shot))
      setColumn(initialColumn(current.shot))
      setSheet(initialSheet(current.shot, opened.snap.items))
      setMinimized(current.shot === 'min' || current.shot === 'mindark')
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [launchKey])

  const show = (text: string, undo: UndoToken | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  if (error) return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>{error}</Text></View>
  if (!boot) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>

  const locale: LocaleId = boot.prefs.locale ?? systemLocale()
  const copy = catalogs[locale]
  const scheme = appearance(boot.snap.theme, systemScheme)
  const theme = themeFor(scheme)

  const refresh = () => setBoot({ ...boot, snap: boot.store.load(clock()) })
  const guard = (fn: () => void) => {
    try { fn(); refresh() } catch (cause) {
      show(cause instanceof StoreError ? copy.conflict : (cause instanceof Error ? cause.message : copy.conflict), null)
    }
  }
  const savePrefs = (prefs: DevicePrefs) => {
    writePrefs(boot.device, prefs)
    setBoot({ ...boot, prefs })
  }

  if (!boot.snap.setupConfirmedAt) {
    return <Setup copy={copy} scheme={scheme} onConfirm={mode => guard(() => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      boot.store.confirm(clock(), { mode, timezone, weekStart: 1 })
    })} />
  }

  return <>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <Goalloom
      copy={copy} theme={theme} snap={boot.snap} prefs={boot.prefs} locale={locale} tab={tab} column={column}
      minimized={minimized} sheet={sheet} toast={toast} shot={shot} viewed={viewed}
      captureSeed={shot === 'capture' ? CAPTURE_SEED : ''}
      onTab={next => { setTab(next); setMinimized(false) }} onColumn={setColumn} onMinimize={setMinimized} onSheet={setSheet}
      onToast={show}
      onCheck={item => guard(() => {
        const next = item.status === 'done' ? 'todo' : 'done'
        const undo = boot.store.setStatus(clock(), item.id, next)
        show(next === 'done' ? copy.doneToast : copy.reopenToast, undo)
      })}
      onTrash={id => guard(() => { const undo = boot.store.trash(clock(), id); show(copy.trashToast, undo) })}
      onMove={(id, horizon) => guard(() => { const undo = boot.store.move(clock(), id, horizon, null); show(copy.moved, undo) })}
      onNest={(id, parentId) => guard(() => { boot.store.nest(clock(), id, parentId) })}
      onReorder={(id, beforeId, afterId) => guard(() => { boot.store.reorder(clock(), id, beforeId, afterId) })}
      onCreate={(drafts, periodId) => guard(() => {
        const made = drafts.filter(draft => draft.title.trim())
        let undo: UndoToken | null = null
        for (const draft of made) undo = createOne(boot.store, draft, periodId ?? null)
        show(copy.created(made.length), made.length === 1 ? undo : null)
      })}
      onEdit={(id, fields) => guard(() => { boot.store.edit(clock(), id, fields) })}
      onFlow={(id, color) => guard(() => { boot.store.setFlow(clock(), id, color) })}
      onLink={(parentId, childId) => guard(() => { boot.store.link(clock(), parentId, childId) })}
      onUnlink={(parentId, childId) => guard(() => { boot.store.unlink(clock(), parentId, childId) })}
      onPolicy={(horizon, mode) => guard(() => { boot.store.setPolicy(horizon, mode) })}
      onAppearance={fields => guard(() => { boot.store.setAppearance(fields) })}
      onBackup={() => guard(() => { boot.store.setBackup(!boot.snap.backupEnabled, boot.snap.backupRetention) })}
      onPrefs={savePrefs}
      onUndo={() => {
        const token = toast?.undo
        if (!token) return
        guard(() => { boot.store.undo(clock(), token); setToast(null) })
      }}
      onRestore={id => guard(() => { boot.store.restore(clock(), id) })}
      onViewPeriod={(horizon, period) => setViewed(current => {
        const next = { ...current }
        if (period) next[horizon] = period
        else delete next[horizon]
        return next
      })}
      activity={id => boot.store.activity(id)}
      periodsAround={horizon => boot.snap.calendar ? nearbyPeriods(boot.snap.calendar, horizon, clock()) : []}
    />
  </>
}

function createOne(store: LocalWorkspace, draft: CaptureDraft, periodId: string | null): UndoToken {
  const parentId = draft.horizon === 'later' ? null : draft.parentId
  const nestingParentId = draft.nestingParentId ?? null
  return store.create(clock(), {
    title: draft.title.trim(),
    horizon: draft.horizon,
    dueDate: draft.dueDate,
    ...(parentId ? { parentId } : {}),
    ...(nestingParentId ? { nestingParentId } : {}),
    ...(periodId ? { periodId } : {}),
  }).undo
}

function appearance(theme: Snapshot['theme'], system: string | null | undefined): Scheme {
  if (theme === 'light' || theme === 'dark') return theme
  if (system === 'dark') return 'dark'
  if (system !== 'light' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function Setup({ copy, scheme, onConfirm }: { copy: Copy; scheme: Scheme; onConfirm: (mode: 'rolling' | 'natural') => void }) {
  const theme = themeFor(scheme)
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<'rolling' | 'natural'>('rolling')
  return <View style={{ flex: 1, backgroundColor: theme.bg, padding: 24, paddingTop: Platform.OS === 'web' ? 72 : insets.top + 24, paddingBottom: Math.max(insets.bottom, 16), gap: 12 }}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <Text style={{ color: theme.fg, fontSize: 28, fontWeight: '700' }}>{copy.setupTitle}</Text>
    {(['rolling', 'natural'] as const).map(option => <Pressable key={option} onPress={() => setMode(option)} style={{ padding: 16, borderRadius: 12, backgroundColor: mode === option ? theme.hover : theme.raised, borderWidth: 1, borderColor: theme.line }}>
      <Text style={{ color: theme.fg, fontWeight: '700' }}>{option === 'rolling' ? copy.rolling : copy.natural}</Text>
      <Text style={{ color: theme.secondary, marginTop: 4 }}>{option === 'rolling' ? copy.rollingBody : copy.naturalBody}</Text>
    </Pressable>)}
    <Text style={{ color: theme.secondary }}>{copy.weekStart}</Text>
    <Pressable onPress={() => onConfirm(mode)} style={{ marginTop: 12, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fg }}>
      <Text style={{ color: theme.onAccent, fontWeight: '700' }}>{copy.confirm}</Text>
    </Pressable>
  </View>
}
