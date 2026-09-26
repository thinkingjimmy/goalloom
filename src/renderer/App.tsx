/**
 * [INPUT]: Workspace state, board visibility, undo session, stable flow views, device preferences and feature components.
 * [OUTPUT]: Board, on-demand dialogs, platform shortcuts, timed or persistent scoped feedback and nonblocking completion celebrations.
 * [POS]: Renderer composition root; composer loads on first use and then keeps its session until the workspace generation changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, smartMessages, useLocale } from './i18n'
import { lazy, startTransition, Suspense, useCallback, useEffect, useState } from 'react'
import { workspaceDate } from '../domain/calendar'
import type { ItemHorizon } from '../shared/contracts/entities'
import { Icon } from './components/icons'
import type { CalendarChoice } from './features/setup/Setup'
import { revealRow } from './features/board/VirtualRows'
import { Board, type AddRequest } from './features/board/Board'
import { boardItemVisibility } from './features/board/visibility'
import { TopBar } from './features/shell/TopBar'
import { CompletionCelebration } from './features/shell/CompletionCelebration'
import { FeedbackLayer } from './features/shell/FeedbackLayer'
import { desktopApi, useWorkspace } from './state/use-workspace'
import { useFlows } from './state/flows'
import { useColumns } from './state/columns'
import { editingTarget } from './state/session'
import { ariaKeys, filterSlot, formatCombo, parseEvent, useShortcuts } from './state/shortcuts'
import type { Section } from './features/shell/settings/Settings'
import { useSmart } from './state/smart'

const Setup = lazy(() => import('./features/setup/Setup').then(module => ({ default: module.Setup })))
const ItemDetail = lazy(() => import('./features/items/ItemDetail').then(module => ({ default: module.ItemDetail })))
const Settings = lazy(() => import('./features/shell/settings/Settings').then(module => ({ default: module.Settings })))
const CommandPalette = lazy(() => import('./features/shell/CommandPalette').then(module => ({ default: module.CommandPalette })))
const Composer = lazy(() => import('./features/composer/Composer').then(module => ({ default: module.Composer })))
const JevStep = lazy(() => import('./features/smart/JevStep').then(module => ({ default: module.JevStep })))

export function App() {
  // Re-render the whole tree on a language switch; state (drafts, undo stack, open dialogs) is kept.
  useLocale()
  const { snapshot, error, errorCode, setError, busy, submit, feedback, setFeedback, completion, undo, undoCount, pending, retry, refresh } = useWorkspace(boardItemVisibility)
  const flows = useFlows(snapshot)
  const smart = useSmart(snapshot?.workspace.generation)
  const [composing, setComposing] = useState(false), [onboarding, setOnboarding] = useState(false)
  const [composerGeneration, setComposerGeneration] = useState<string | null>(null)
  const columns = useColumns()
  const { bindings, filters: filterKeys } = useShortcuts()
  // Keep the current view responsive while a local dialog chunk loads, without a timed fallback flash.
  const compose = () => startTransition(() => { setComposerGeneration(snapshot?.workspace.generation ?? null); setComposing(true) })
  const [settings, setSettings] = useState(false), [settingsSection, setSettingsSection] = useState<Section>('appearance')
  const [selected, setSelected] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const openPalette = () => startTransition(() => setPalette(true))
  const [filter, setFilter] = useState<string | null>(null)
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null)
  const [toastHeld, setToastHeld] = useState(false)
  const toastRef = useCallback((node: HTMLDivElement | null) => { setToastHeld(!!node && (node.matches(':hover') || node.contains(document.activeElement))) }, [])
  useEffect(() => {
    if (!feedback || feedback.durationMs === null || toastHeld || busy) return
    const timer = setTimeout(() => setFeedback(null), feedback.durationMs)
    return () => clearTimeout(timer)
  }, [feedback, toastHeld, busy, setFeedback])
  const select = useCallback((id: string) => startTransition(() => setSelected(id)), [])
  const closeDetail = () => { const id = selected; setSelected(null); if (id && !settings) requestAnimationFrame(() => revealRow(id, '.task-title')) }
  const requestAdd = (horizon: ItemHorizon | null, split: AddRequest['split'] = null) => { setAddRequest(previous => ({ seq: (previous?.seq ?? 0) + 1, horizon, split })) }
  const theme = snapshot?.workspace.theme ?? 'system', style = snapshot?.workspace.style ?? 'paper', checkStyle = snapshot?.workspace.checkStyle ?? 'outline'
  const ready = !!snapshot?.workspace.setupConfirmedAt
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.documentElement.dataset.style = style }, [style])
  useEffect(() => { document.documentElement.dataset.check = checkStyle }, [checkStyle])
  useEffect(() => { document.documentElement.dataset.platform = navigator.userAgent.includes('Mac') ? 'mac' : 'other' }, [])
  useEffect(() => { setSelected(null); setPalette(false); setSettings(false); setFilter(null); setComposing(false) }, [snapshot?.workspace.generation])
  // A filter pointing at a flow that no longer exists falls back to showing everything.
  useEffect(() => { if (filter && !flows.visible.some(flow => flow.id === filter)) setFilter(null) }, [flows, filter])
  const openSettings = (section: Section = 'appearance') => startTransition(() => { setSettingsSection(section); setSettings(true) })
  // The calendar is confirmed first (it gates every item write); the onboarding direction then becomes an ordinary, undoable 3-month flow root.
  const confirmSetup = async (calendar: CalendarChoice, direction: string) => {
    if (!await submit({ type: 'confirmSetup', ...calendar, confirmed: true })) return
    startTransition(() => setOnboarding(true))
    if (direction) await submit({ type: 'create', title: direction, description: '', dueDate: null, horizon: 'cycle', parentId: null, expectedParentVersion: null, flowColor: 0 })
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const combo = event.isComposing ? null : parseEvent(event)
      if (!combo) return
      const editing = editingTarget(event.target)
      if (combo === bindings.undo && !editing) { event.preventDefault(); if (!busy) void undo() }
      if (!ready || onboarding || selected || settings || composing || palette) return
      if (combo === bindings.palette) { event.preventDefault(); openPalette() }
      if (editing) return
      if (combo === bindings.compose) { event.preventDefault(); compose() }
      if (combo === bindings.settings) { event.preventDefault(); openSettings() }
      // Chip position like browser tabs: the first is 全部, then flows in top-bar order; a missing slot does nothing.
      const slot = filterSlot(filterKeys, combo)
      if (slot === 0) { event.preventDefault(); setFilter(null) }
      if (slot > 0) { event.preventDefault(); const flow = flows.visible[slot - 1]; if (flow) setFilter(flow.id) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo, busy, selected, settings, ready, onboarding, composing, palette, bindings, filterKeys, flows])
  const today = snapshot?.workspace.calendar ? workspaceDate(snapshot.workspace.calendar.timezone, snapshot.observedAt) : ''
  return <div className="app-shell">
    <TopBar ready={ready && !onboarding} flows={flows} filter={filter} setFilter={setFilter} columns={columns} bindings={bindings} filterKeys={filterKeys} active={palette ? 'search' : settings ? 'settings' : null}
      openSearch={openPalette} openSettings={() => openSettings()} />
    {snapshot?.workspace.clockAnomaly && <div className="notice-banner">{messages.clockWarning}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmClock', confirmed: true })}>{messages.confirmClock}</button></div>}
    {snapshot?.workspace.calendar && Intl.DateTimeFormat().resolvedOptions().timeZone !== snapshot.workspace.calendar.timezone && <div className="notice-banner">{messages.timezoneMismatch} {snapshot.workspace.calendar.timezone}。</div>}
    {snapshot?.workspace.pausedAfterRestore && <div className="notice-banner">{messages.restorePaused}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmRollover', confirmed: true })}>{messages.confirmRollover}</button></div>}
    {snapshot?.backupError && <div className="notice-banner">{snapshot.backupError}<button className="text-button" onClick={() => openSettings('backup')}>{messages.viewBackups}</button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <button className="text-button" onClick={() => void retry()}>{messages.retry}</button>}<button className="icon-button small" aria-label={messages.closeError} onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    <Suspense fallback={<main className="setup-page" role="status">{messages.opening}</main>}>
    {!snapshot ? <main className="setup-page" role="status">{messages.opening}</main> : !ready ? <Setup confirm={(calendar, direction) => void confirmSetup(calendar, direction)} busy={busy} />
      : onboarding ? <JevStep smart={smart} finish={() => setOnboarding(false)} /> : <>
      <div className="board-host"><Board key={snapshot.workspace.generation} snapshot={snapshot} flows={flows} filter={filter} columns={columns.visible} submit={submit} busy={busy} select={select} addRequest={addRequest} highlighted={selected} /></div>
      <button className="fab" aria-label={messages.newItem} title={[messages.newItem, formatCombo(bindings.compose)].filter(Boolean).join(' ')} aria-keyshortcuts={ariaKeys(bindings.compose)} disabled={busy} onClick={compose}><Icon name="add" size={24} strokeWidth={1.8} /></button>
    </>}
    </Suspense>
    <Suspense fallback={null}>
    {settings && snapshot && <Settings snapshot={snapshot} smart={smart} initial={settingsSection} submit={submit} refresh={refresh} busy={busy} select={select} close={() => setSettings(false)} />}
    </Suspense>
    <Suspense fallback={null}>
    {palette && <CommandPalette close={() => setPalette(false)} select={select} undo={() => void undo()} canUndo={!busy && undoCount > 0} create={compose} openSettings={openSettings} bindings={bindings} />}
    </Suspense>
    <Suspense fallback={null}>
    {snapshot && ready && composerGeneration === snapshot.workspace.generation && <Composer key={snapshot.workspace.generation} open={composing} snapshot={snapshot} flows={flows} smart={smart} submit={submit} busy={busy} error={error} errorCode={errorCode} close={() => setComposing(false)} openSettings={() => openSettings('smart')} />}
    </Suspense>
    <Suspense fallback={null}>
    {selected && snapshot && <ItemDetail key={`${snapshot.workspace.generation}:${selected}`} itemId={selected} select={select} close={closeDetail} submit={submit} revision={snapshot.workspace.revision} busy={busy}
      flows={flows} candidates={snapshot.items} today={today} split={(parent, horizon) => { setSelected(null); setSettings(false); requestAdd(horizon, parent) }}
      locate={snapshot.items.some(item => item.id === selected) ? () => { const id = selected; setSettings(false); setSelected(null); requestAnimationFrame(() => revealRow(id, '.task-title')) } : undefined} />}
    </Suspense>
    {feedback && <FeedbackLayer><div ref={toastRef} className="toast" key={feedback.result.operationId} data-warning={!!feedback.warning}
      onMouseEnter={() => setToastHeld(true)} onMouseLeave={event => setToastHeld(event.currentTarget.contains(document.activeElement))}
      onFocus={() => setToastHeld(true)} onBlur={event => setToastHeld(event.currentTarget.matches(':hover') || event.currentTarget.contains(event.relatedTarget))}>
      <div className="toast-copy" role={feedback.warning ? 'alert' : 'status'}>
        <span className="toast-title">{feedback.text}</span>
        {feedback.detail && <span className="toast-detail">{feedback.detail}</span>}
        {feedback.warning && <span className="toast-warning">{feedback.warning}</span>}
      </div>
      {!feedback.result.undoable && !feedback.result.originalOperationId && <button className="toast-action" onClick={() => openSettings('calendar')}>{messages.viewBatches}</button>}
      {feedback.result.undoable && <button className="toast-action" disabled={busy} onClick={() => void undo(feedback.result.operationId)}>{messages.undo}{bindings.undo && <kbd>{formatCombo(bindings.undo)}</kbd>}</button>}
      {feedback.result.restoreSource && !feedback.result.itemId && (feedback.result.itemIds?.length ?? 0) > 1 && <button className="toast-action" onClick={() => { setFeedback(null); openSettings('trash') }}>{smartMessages.viewTrash}</button>}
      {feedback.result.restoreSource && feedback.result.itemId && <button className="toast-action" disabled={busy} onClick={async () => {
        if (!feedback.result.itemId || feedback.result.generation !== snapshot?.workspace.generation) return
        try { const detail = await desktopApi().getItem(feedback.result.itemId); await submit({ type: 'restoreItem', itemId: detail.item.id, expectedVersion: detail.item.version, deletionSource: feedback.result.restoreSource }) }
        catch { setError(messages.restoreItemFailed) }
      }}>{messages.restoreItem}</button>}
      <button className="icon-button small" aria-label={messages.closeFeedback} onClick={() => setFeedback(null)}><Icon name="close" size={14} /></button>
    </div></FeedbackLayer>}
    <CompletionCelebration event={completion} generation={snapshot?.workspace.generation ?? ''} />
    <span className="sr-only" role="status">{busy ? messages.saving : snapshot ? messages.connected : messages.connecting}</span>
  </div>
}
