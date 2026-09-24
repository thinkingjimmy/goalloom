/**
 * [INPUT]: 权威工作区、会话撤销、流程派生视图、设备侧智能输入状态、受限命令和页面组件。
 * [OUTPUT]: 顶栏/配置→可选 Jev 步骤/可选显示列的看板/详情/设置（含已完成与回收站）/搜索、本机可改键的全局快捷键（搜索/新建/设置/撤销/按顶栏位置筛选流程）；FAB 与新建快捷键打开全局 composer（会话草稿保留），列头＋与拆解保留原入口；单项定向还原、多项查看回收站的撤销反馈（6 秒自动消失，悬停/聚焦时暂停）。
 * [POS]: renderer 组合根；工作区代次更换清空旧页面、会话状态与 composer 草稿。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages, smartMessages, useLocale } from './i18n'
import { useEffect, useState } from 'react'
import { workspaceDate } from '../domain/calendar'
import type { ItemHorizon } from '../shared/contracts/entities'
import { Icon } from './components/icons'
import { Setup } from './features/setup/Setup'
import { Board, type AddRequest } from './features/board/Board'
import { ItemDetail } from './features/items/ItemDetail'
import { TopBar } from './features/shell/TopBar'
import { desktopApi, useWorkspace } from './state/use-workspace'
import { useFlows } from './state/flows'
import { useColumns } from './state/columns'
import { editingTarget } from './state/session'
import { ariaKeys, filterSlot, formatCombo, parseEvent, useShortcuts } from './state/shortcuts'
import { Settings, type Section } from './features/shell/settings/Settings'
import { CommandPalette } from './features/shell/CommandPalette'
import { Composer, type ComposerMemory } from './features/composer/Composer'
import { JevStep } from './features/smart/JevStep'
import { useSmart } from './state/smart'

// Long enough to read and reach the undo button; the undo shortcut keeps working after the toast leaves.
const TOAST_MS = 6000

export function App() {
  // Re-render the whole tree on a language switch; state (drafts, undo stack, open dialogs) is kept.
  useLocale()
  const { snapshot, error, setError, busy, submit, feedback, setFeedback, undo, undoCount, pending, retry, refresh } = useWorkspace()
  const flows = useFlows(snapshot)
  const smart = useSmart(snapshot?.workspace.generation)
  const [composing, setComposing] = useState(false), [memory, setMemory] = useState<ComposerMemory | null>(null), [onboarding, setOnboarding] = useState(false)
  const columns = useColumns()
  const { bindings, filters: filterKeys } = useShortcuts()
  const compose = () => setComposing(true)
  const [settings, setSettings] = useState(false), [settingsSection, setSettingsSection] = useState<Section>('appearance')
  const [selected, setSelected] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null)
  const [toastHeld, setToastHeld] = useState(false)
  useEffect(() => {
    if (!feedback || toastHeld || busy) return
    const timer = setTimeout(() => setFeedback(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [feedback, toastHeld, busy, setFeedback])
  useEffect(() => { if (!feedback) setToastHeld(false) }, [feedback])
  const select = (id: string) => setSelected(id)
  const requestAdd = (horizon: ItemHorizon | null, split: AddRequest['split'] = null) => { setAddRequest(previous => ({ seq: (previous?.seq ?? 0) + 1, horizon, split })) }
  const theme = snapshot?.workspace.theme ?? 'system', style = snapshot?.workspace.style ?? 'paper', checkStyle = snapshot?.workspace.checkStyle ?? 'outline'
  const ready = !!snapshot?.workspace.setupConfirmedAt
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.documentElement.dataset.style = style }, [style])
  useEffect(() => { document.documentElement.dataset.check = checkStyle }, [checkStyle])
  useEffect(() => { document.documentElement.dataset.platform = navigator.userAgent.includes('Mac') ? 'mac' : 'other' }, [])
  useEffect(() => { setSelected(null); setPalette(false); setSettings(false); setFilter(null); setComposing(false); setMemory(null) }, [snapshot?.workspace.generation])
  // A filter pointing at a flow that no longer exists falls back to showing everything.
  useEffect(() => { if (filter && !flows.visible.some(flow => flow.id === filter)) setFilter(null) }, [flows, filter])
  const openSettings = (section: Section = 'appearance') => { setSettingsSection(section); setSettings(true) }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const combo = event.isComposing ? null : parseEvent(event)
      if (!combo) return
      const editing = editingTarget(event.target)
      if (combo === bindings.undo && !editing) { event.preventDefault(); if (!busy) void undo() }
      if (!ready || onboarding || selected || settings || composing || palette) return
      if (combo === bindings.palette) { event.preventDefault(); setPalette(true) }
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
    <TopBar ready={ready} flows={flows} filter={filter} setFilter={setFilter} columns={columns} bindings={bindings} filterKeys={filterKeys} active={palette ? 'search' : settings ? 'settings' : null}
      openSearch={() => setPalette(true)} openSettings={() => openSettings()} />
    {snapshot?.workspace.clockAnomaly && <div className="notice-banner">{messages.clockWarning}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmClock', confirmed: true })}>{messages.confirmClock}</button></div>}
    {snapshot?.workspace.calendar && Intl.DateTimeFormat().resolvedOptions().timeZone !== snapshot.workspace.calendar.timezone && <div className="notice-banner">{messages.timezoneMismatch} {snapshot.workspace.calendar.timezone}。</div>}
    {snapshot?.workspace.pausedAfterRestore && <div className="notice-banner">{messages.restorePaused}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmRollover', confirmed: true })}>{messages.confirmRollover}</button></div>}
    {snapshot?.backupError && <div className="notice-banner">{snapshot.backupError}<button className="text-button" onClick={() => openSettings('backup')}>{messages.viewBackups}</button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <button className="text-button" onClick={() => void retry()}>{messages.retry}</button>}<button className="icon-button small" aria-label={messages.closeError} onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    {!snapshot ? <main className="setup-page" role="status">{messages.opening}</main> : !ready ? <Setup submit={async action => { const result = await submit(action); if (result) setOnboarding(true); return result }} busy={busy} />
      : onboarding ? <JevStep smart={smart} finish={() => setOnboarding(false)} tryComposer={() => { setOnboarding(false); setMemory({ text: smartMessages.sampleText, drafts: [], removed: [], parents: [], warnings: [], previewText: null, consentRevision: smart.status?.providerRevision ?? null }); compose() }} /> : <>
      <div className="board-host"><Board key={snapshot.workspace.generation} snapshot={snapshot} flows={flows} filter={filter} columns={columns.visible} submit={submit} busy={busy} select={select} addRequest={addRequest} highlighted={selected} /></div>
      <button className="fab" aria-label={messages.newItem} title={[messages.newItem, formatCombo(bindings.compose)].filter(Boolean).join(' ')} aria-keyshortcuts={ariaKeys(bindings.compose)} disabled={busy} onClick={compose}><Icon name="add" size={24} strokeWidth={1.8} /></button>
    </>}
    {settings && snapshot && <Settings snapshot={snapshot} smart={smart} initial={settingsSection} submit={submit} refresh={refresh} busy={busy} select={select} close={() => setSettings(false)} />}
    {palette && <CommandPalette close={() => setPalette(false)} select={select} undo={() => void undo()} canUndo={!busy && undoCount > 0} create={compose} openSettings={openSettings} bindings={bindings} />}
    {composing && snapshot && ready && <Composer key={snapshot.workspace.generation} snapshot={snapshot} flows={flows} smart={smart} submit={submit} busy={busy} error={error} memory={memory} keep={setMemory} close={() => setComposing(false)} openSettings={() => openSettings('smart')} />}
    {selected && snapshot && <ItemDetail key={`${snapshot.workspace.generation}:${selected}`} itemId={selected} select={select} close={() => setSelected(null)} submit={submit} revision={snapshot.workspace.revision} busy={busy}
      flows={flows} candidates={snapshot.items} today={today} split={(parent, horizon) => { setSelected(null); setSettings(false); requestAdd(horizon, parent) }}
      locate={snapshot.items.some(item => item.id === selected) ? () => { setSettings(false); setSelected(null) } : undefined} />}
    {feedback && <div className="toast" key={feedback.result.operationId}
      onMouseEnter={() => setToastHeld(true)} onMouseLeave={() => setToastHeld(false)}
      onFocus={() => setToastHeld(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setToastHeld(false) }}><span role="status">{feedback.text}</span>
      {!feedback.result.undoable && !feedback.result.originalOperationId && <button className="toast-action" onClick={() => openSettings('calendar')}>{messages.viewBatches}</button>}
      {feedback.result.undoable && <button className="toast-action" disabled={busy} onClick={() => void undo(feedback.result.operationId)}>{messages.undo}{bindings.undo && <kbd>{formatCombo(bindings.undo)}</kbd>}</button>}
      {feedback.result.restoreSource && !feedback.result.itemId && (feedback.result.itemIds?.length ?? 0) > 1 && <button className="toast-action" onClick={() => { setFeedback(null); openSettings('trash') }}>{smartMessages.viewTrash}</button>}
      {feedback.result.restoreSource && feedback.result.itemId && <button className="toast-action" disabled={busy} onClick={async () => {
        if (!feedback.result.itemId || feedback.result.generation !== snapshot?.workspace.generation) return
        try { const detail = await desktopApi().getItem(feedback.result.itemId); await submit({ type: 'restoreItem', itemId: detail.item.id, expectedVersion: detail.item.version, deletionSource: feedback.result.restoreSource }) }
        catch { setError(messages.restoreItemFailed) }
      }}>{messages.restoreItem}</button>}
      <button className="icon-button small" aria-label={messages.closeFeedback} onClick={() => setFeedback(null)}><Icon name="close" size={14} /></button>
    </div>}
    <span className="sr-only" role="status">{busy ? messages.saving : snapshot ? messages.connected : messages.connecting}</span>
  </div>
}
