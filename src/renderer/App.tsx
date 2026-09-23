/**
 * [INPUT]: 权威工作区、会话撤销、流程派生视图、设备侧智能输入状态、受限命令和页面组件。
 * [OUTPUT]: 顶栏/配置→可选 Jev 步骤/五列/状态视图/详情/设置/搜索、快捷键；FAB 与 Cmd/Ctrl+N 打开全局 composer（会话草稿保留），列头＋与拆解保留原入口；单项定向还原、多项查看回收站的撤销反馈。
 * [POS]: renderer 组合根；工作区代次更换清空旧页面、会话状态与 composer 草稿。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from './i18n/messages'
import { useEffect, useState } from 'react'
import { workspaceDate } from '../domain/calendar'
import type { ItemHorizon } from '../shared/contracts/entities'
import { Icon } from './components/icons'
import { Setup } from './features/setup/Setup'
import { Board, type AddRequest } from './features/board/Board'
import { ItemDetail } from './features/items/ItemDetail'
import { ItemList } from './features/items/ItemList'
import { TopBar, type View } from './features/shell/TopBar'
import { desktopApi, useWorkspace } from './state/use-workspace'
import { useFlows } from './state/flows'
import { editingTarget } from './state/session'
import { Settings, type Section } from './features/shell/settings/Settings'
import { CommandPalette } from './features/shell/CommandPalette'
import { Composer, type ComposerMemory } from './features/composer/Composer'
import { JevStep } from './features/smart/JevStep'
import { useSmart } from './state/smart'
import { smartMessages } from './i18n/smart'

export function App() {
  const { snapshot, error, setError, busy, submit, feedback, setFeedback, undo, undoCount, pending, retry, refresh } = useWorkspace()
  const flows = useFlows(snapshot)
  const smart = useSmart(snapshot?.workspace.generation)
  const [composing, setComposing] = useState(false), [memory, setMemory] = useState<ComposerMemory | null>(null), [onboarding, setOnboarding] = useState(false)
  const compose = () => { setView('board'); setComposing(true) }
  const [settings, setSettings] = useState(false), [settingsSection, setSettingsSection] = useState<Section>('appearance')
  const [selected, setSelected] = useState<string | null>(null)
  const [palette, setPalette] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [view, setView] = useState<View>('board'), [addRequest, setAddRequest] = useState<AddRequest | null>(null)
  const select = (id: string) => setSelected(id)
  const requestAdd = (horizon: ItemHorizon | null, split: AddRequest['split'] = null) => { setView('board'); setAddRequest(previous => ({ seq: (previous?.seq ?? 0) + 1, horizon, split })) }
  const theme = snapshot?.workspace.theme ?? 'system', style = snapshot?.workspace.style ?? 'paper'
  const ready = !!snapshot?.workspace.setupConfirmedAt
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.documentElement.dataset.style = style }, [style])
  useEffect(() => { document.documentElement.dataset.platform = navigator.userAgent.includes('Mac') ? 'mac' : 'other' }, [])
  useEffect(() => { setSelected(null); setPalette(false); setSettings(false); setView('board'); setFilter(null); setComposing(false); setMemory(null) }, [snapshot?.workspace.generation])
  // A filter pointing at a flow that no longer exists falls back to showing everything.
  useEffect(() => { if (filter && !flows.all.some(flow => flow.id === filter && !flow.archived)) setFilter(null) }, [flows, filter])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || (!event.metaKey && !event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && !editingTarget(event.target)) { event.preventDefault(); if (!busy) void undo() }
      if (!ready || onboarding || selected || settings || composing) return
      if (key === 'k') { event.preventDefault(); setPalette(true) }
      if (key === 'n' && !editingTarget(event.target)) { event.preventDefault(); compose() }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo, busy, selected, settings, ready, onboarding, composing])
  const today = snapshot?.workspace.calendar ? workspaceDate(snapshot.workspace.calendar.timezone, snapshot.observedAt) : ''
  return <div className="app-shell">
    <TopBar ready={ready} flows={flows} filter={filter} setFilter={setFilter} view={view} setView={setView} active={palette ? 'search' : settings ? 'settings' : null}
      openSearch={() => setPalette(true)} openSettings={() => setSettings(true)}
      jumpToday={() => { setView('board'); requestAnimationFrame(() => document.querySelector('[data-horizon=day]')?.scrollIntoView({ block: 'nearest', inline: 'end' })) }} />
    {snapshot?.workspace.clockAnomaly && <div className="notice-banner">{messages.clockWarning}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmClock', confirmed: true })}>{messages.confirmClock}</button></div>}
    {snapshot?.workspace.calendar && Intl.DateTimeFormat().resolvedOptions().timeZone !== snapshot.workspace.calendar.timezone && <div className="notice-banner">{messages.timezoneMismatch} {snapshot.workspace.calendar.timezone}。</div>}
    {snapshot?.workspace.pausedAfterRestore && <div className="notice-banner">{messages.restorePaused}<button className="text-button" disabled={busy} onClick={() => void submit({ type: 'confirmRollover', confirmed: true })}>{messages.confirmRollover}</button></div>}
    {snapshot?.backupError && <div className="notice-banner">{snapshot.backupError}<button className="text-button" onClick={() => setSettings(true)}>{messages.viewBackups}</button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <button className="text-button" onClick={() => void retry()}>{messages.retry}</button>}<button className="icon-button small" aria-label={messages.closeError} onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    {!snapshot ? <main className="setup-page" role="status">{messages.opening}</main> : !ready ? <Setup submit={async action => { const result = await submit(action); if (result) setOnboarding(true); return result }} busy={busy} />
      : onboarding ? <JevStep smart={smart} finish={() => setOnboarding(false)} tryComposer={() => { setOnboarding(false); setMemory({ text: smartMessages.sampleText, drafts: [], removed: [], parents: [], warnings: [], previewText: null, consentRevision: smart.status?.providerRevision ?? null }); compose() }} /> : <>
      <div className="board-host" hidden={view !== 'board'}><Board key={snapshot.workspace.generation} snapshot={snapshot} flows={flows} filter={filter} submit={submit} busy={busy} select={select} addRequest={addRequest} highlighted={selected} /></div>
      {view !== 'board' && <ItemList key={`${snapshot.workspace.generation}:${view}`} view={view} revision={snapshot.workspace.revision} select={select} timezone={snapshot.workspace.calendar!.timezone} />}
      {view === 'board' && <button className="fab" aria-label={messages.newItem} title="⌘N" disabled={busy} onClick={compose}><Icon name="add" size={24} strokeWidth={1.8} /></button>}
    </>}
    {settings && snapshot && <Settings snapshot={snapshot} smart={smart} initial={settingsSection} submit={submit} refresh={refresh} busy={busy} close={() => { setSettings(false); setSettingsSection('appearance') }} />}
    {palette && <CommandPalette close={() => setPalette(false)} navigate={setView} select={select} undo={() => void undo()} canUndo={!busy && undoCount > 0} create={compose} openSettings={() => setSettings(true)} />}
    {composing && snapshot && ready && <Composer key={snapshot.workspace.generation} snapshot={snapshot} flows={flows} smart={smart} submit={submit} busy={busy} error={error} memory={memory} keep={setMemory} close={() => setComposing(false)} openSettings={() => { setSettingsSection('smart'); setSettings(true) }} />}
    {selected && snapshot && <ItemDetail key={`${snapshot.workspace.generation}:${selected}`} itemId={selected} select={select} close={() => setSelected(null)} submit={submit} revision={snapshot.workspace.revision} busy={busy}
      flows={flows} candidates={snapshot.items} today={today} split={(parent, horizon) => { setSelected(null); requestAdd(horizon, parent) }}
      locate={snapshot.items.some(item => item.id === selected) ? () => { setView('board'); setSelected(null) } : undefined} />}
    {feedback && <div className="toast" key={feedback.result.operationId}><span role="status">{feedback.text}</span>
      {!feedback.result.undoable && !feedback.result.originalOperationId && <button className="toast-action" onClick={() => setSettings(true)}>{messages.viewBatches}</button>}
      {feedback.result.undoable && <button className="toast-action" disabled={busy} onClick={() => void undo(feedback.result.operationId)}>{messages.undo}<kbd>⌘Z</kbd></button>}
      {feedback.result.restoreSource && !feedback.result.itemId && (feedback.result.itemIds?.length ?? 0) > 1 && <button className="toast-action" onClick={() => { setFeedback(null); setView('trash') }}>{smartMessages.viewTrash}</button>}
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
