/**
 * [INPUT]: Local SQLite workspace, device preferences, account lifecycle and explicit UI intents.
 * [OUTPUT]: Mobile boot, offline commands, onboarding and guarded account/settings navigation.
 * [POS]: Mobile composition root; account credentials stay outside the workspace database.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { randomUUID } from 'expo-crypto'
import {
  ACTION_TOAST_MS, BOARD_COLUMNS, DEMO_NOW, LocalWorkspace, OPEN_COLUMN, StoreError, UNDO_TOAST_MS, actionNotice, columnIndex, installDevice, installSchema,
  nearbyPeriods, readPrefs, seedDemo, writePrefs, type CaptureDraft, type DevicePrefs, type Glance, type Horizon, type ItemRow,
  type AiConnection, type LocaleId, type Notice, type Period, type PeriodHorizon, type Snapshot, type UndoToken,
} from '@goalloom/local-store'
import { accountService } from './account/service'
import { AccountScreen } from './account/screen'
import { accountCopy } from './account/copy'
import { loadAiConnection } from './ai-account'
import { AiConnect } from './ai-connect'
import { catalogs, systemLocale } from './copy'
import { Onboarding } from './onboarding'
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

function initialHorizon(shot: string, prefs: DevicePrefs): Horizon {
  const requested: Horizon = shot === 'week' || shot === 'mid' || shot === 'drag' || shot === 'emptycol' || shot === 'sub' ? 'week'
    : shot === 'month' ? 'month' : shot === 'later' ? 'later' : OPEN_COLUMN
  const columns = BOARD_COLUMNS.filter(column => column === 'later' ? prefs.later : prefs.columns[column])
  return columns[columnIndex(columns, requested)] ?? OPEN_COLUMN
}

function initialTab(shot: string): 'board' | 'flow' | 'settings' {
  if (shot === 'flow' || shot === 'flowsticky') return 'flow'
  if (shot === 'settings') return 'settings'
  return 'board'
}

export default function Root() {
  const systemScheme = useColorScheme()
  const account = useSyncExternalStore(accountService.subscribe, accountService.snapshot)
  const [accountOpen, setAccountOpen] = useState(false)
  useEffect(() => { void accountService.start() }, [])
  const [boot, setBoot] = useState<Boot | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'board' | 'flow' | 'settings'>('board')
  const [boardHorizon, setBoardHorizon] = useState<Horizon>(OPEN_COLUMN)
  const [minimized, setMinimized] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<Notice | null>(null)
  const [ai, setAi] = useState<AiConnection | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  useEffect(() => { void loadAiConnection().then(setAi) }, [])
  const [viewed, setViewed] = useState<Partial<Record<PeriodHorizon, Period>>>({})
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootRef = useRef<Boot | null>(null)
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
      setBoardHorizon(initialHorizon(current.shot, opened.prefs))
      setSheet(initialSheet(current.shot, opened.snap.items))
      setMinimized(current.shot === 'min' || current.shot === 'mindark')
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [launchKey])

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      accountService.setForeground(state === 'active')
      if (state !== 'active') return
      const current = bootRef.current
      if (!current?.snap.setupConfirmedAt) return
      try { setBoot({ ...current, snap: current.store.load(clock()) }) } catch { /* keep the visible board when a foreground refresh fails */ }
    })
    return () => sub.remove()
  }, [])

  const show = (notice: Notice) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(notice)
    toastTimer.current = setTimeout(() => setToast(null), notice.durationMs)
  }
  const showError = (text: string) => show({ text, detail: null, undo: null, label: '', title: null, durationMs: ACTION_TOAST_MS })

  if (error) return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>{error}</Text></View>
  if (!boot) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>

  const locale: LocaleId = boot.prefs.locale ?? systemLocale()
  const copy = catalogs[locale]
  const scheme = appearance(boot.snap.theme, systemScheme)
  const theme = themeFor(scheme, boot.snap.style === 'minimal' ? 'minimal' : 'paper')

  bootRef.current = boot
  const refresh = () => setBoot({ ...boot, snap: boot.store.load(clock()) })
  const guard = (fn: () => void): boolean => {
    try { fn(); refresh(); return true } catch (cause) {
      showError(cause instanceof StoreError ? copy.conflict : (cause instanceof Error ? cause.message : copy.conflict))
      return false
    }
  }
  const savePrefs = (prefs: DevicePrefs) => {
    writePrefs(boot.device, prefs)
    setBoot({ ...boot, prefs })
  }
  const columns = BOARD_COLUMNS.filter(horizon => horizon === 'later' ? boot.prefs.later : boot.prefs.columns[horizon])
  const column = columnIndex(columns, boardHorizon)
  const shown = columns[column]
  if (shown && shown !== boardHorizon) setBoardHorizon(shown)
  const openHorizon = tab === 'board' ? columns[column] ?? null : null
  const openPeriod = openHorizon && openHorizon !== 'later' ? viewed[openHorizon] ?? boot.snap.periods[openHorizon] ?? null : null
  const glance: Glance = { tab, horizon: openHorizon, periodId: openPeriod?.id ?? null, columns, doneOpen: false }

  if (!boot.snap.setupConfirmedAt) {
    return <Onboarding copy={copy} scheme={scheme} locale={locale} now={clock()} account={account} onSignIn={provider => { void accountService.signIn(provider) }} onConfirm={input => guard(() => {
      const at = clock()
      boot.store.confirm(at, {
        mode: input.mode, timezone: input.timezone, weekStart: input.weekStart,
        ...(input.mode === 'rolling' ? { anchor: input.anchor } : {}),
      })
      const title = input.direction.trim()
      if (title) boot.store.create(at, { title, horizon: 'year', flowColor: 0 })
    })} />
  }

  return <View style={styles.app}>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <Goalloom
      copy={copy} theme={theme} snap={boot.snap} prefs={boot.prefs} locale={locale} tab={tab} column={column}
      accountLabel={accountService.platform.supported ? account.email ?? accountCopy(locale).signedOut : null} onOpenAccount={() => setAccountOpen(true)}
      minimized={minimized} sheet={sheet} toast={toast} shot={shot} viewed={viewed} ai={ai} onOpenAi={() => setAiOpen(true)}
      captureSeed={shot === 'capture' ? CAPTURE_SEED : ''}
      onTab={next => { setTab(next); setMinimized(false) }} onColumn={index => { const next = columns[index]; if (next) setBoardHorizon(next) }} onMinimize={setMinimized} onSheet={setSheet}
      onDismissToast={() => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast(null) }}
      onCheck={item => guard(() => {
        const next = item.status === 'done' ? 'todo' : 'done'
        const undo = boot.store.setStatus(clock(), item.id, next)
        if (next === 'done') return
        const notice = actionNotice(copy, 'reopen', item, undo, glance, boot.snap)
        if (notice) show(notice)
      })}
      onTrash={id => guard(() => {
        const item = findItem(boot.snap, id)
        const undo = boot.store.trash(clock(), id)
        const notice = actionNotice(copy, 'delete', item, undo, glance, boot.snap)
        if (notice) show(notice)
      })}
      onMove={(id, horizon) => guard(() => { boot.store.move(clock(), id, horizon, null) })}
      onNest={(id, parentId) => guard(() => {
        const item = findItem(boot.snap, id)
        const undo = boot.store.nest(clock(), id, parentId)
        const notice = actionNotice(copy, 'nest', item, undo, glance, boot.snap)
        if (notice) show(notice)
      })}
      onReorder={(id, beforeId, afterId) => guard(() => { boot.store.reorder(clock(), id, beforeId, afterId) })}
      onCreate={(drafts, periodId) => guard(() => {
        for (const draft of drafts) if (draft.title.trim()) createOne(boot.store, draft, periodId ?? null)
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
        const current = toast
        if (!current?.undo) return
        const token = current.undo
        if (!guard(() => { boot.store.undo(clock(), token) })) return
        show({ text: copy.undone(current.label, current.title), detail: null, undo: null, label: current.label, title: current.title, durationMs: UNDO_TOAST_MS })
      }}
      onRestore={id => guard(() => {
        const item = findItem(boot.snap, id)
        const undo = boot.store.restore(clock(), id)
        const notice = actionNotice(copy, 'restore', item, undo, glance, boot.snap)
        if (notice) show(notice)
      })}
      onViewPeriod={(horizon, period) => {
        if (period && !guard(() => { boot.store.savePeriod(period) })) return
        setViewed(current => {
          const next = { ...current }
          if (period) next[horizon] = period
          else delete next[horizon]
          return next
        })
      }}
      activity={id => boot.store.activity(id)}
      periodsAround={horizon => boot.snap.calendar ? nearbyPeriods(boot.snap.calendar, horizon, clock()) : []}
    />
    {accountOpen && <View style={[StyleSheet.absoluteFill, styles.ai, { backgroundColor: theme.bg }]}>
      <AccountScreen state={account} copy={copy} locale={locale} theme={theme} onBack={() => setAccountOpen(false)} />
    </View>}
    {aiOpen && <View style={[StyleSheet.absoluteFill, styles.ai, { backgroundColor: theme.bg }]}>
      <AiConnect copy={copy} theme={theme} connection={ai} onConnection={setAi} onBack={() => setAiOpen(false)} />
    </View>}
  </View>
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  ai: { zIndex: 20 },
})

function findItem(snap: Snapshot, id: string): ItemRow | null {
  return snap.items.find(item => item.id === id) ?? snap.trash.find(item => item.id === id) ?? null
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

