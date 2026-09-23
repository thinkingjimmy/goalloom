/**
 * [INPUT]: 权威工作区、会话撤销、受限命令和页面组件。
 * [OUTPUT]: 配置/五列/状态视图/详情、持久主题、快捷键和撤销反馈。
 * [POS]: renderer 组合根；工作区代次更换清空旧页面和会话状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from './i18n/messages'
import { useEffect, useState } from 'react'
import { Icon } from './components/icons'
import { Button } from './components/ui/button'
import { Setup } from './features/setup/Setup'
import { Board } from './features/board/Board'
import { ItemDetail } from './features/items/ItemDetail'
import { ItemList } from './features/items/ItemList'
import type { ListView } from '../shared/contracts/queries'
import { viewNames } from './i18n/messages'
import { desktopApi, useWorkspace } from './state/use-workspace'
import { editingTarget } from './state/session'
import { Settings } from './features/settings/Settings'
import { CommandPalette } from './features/search/CommandPalette'

export function App() {
  const { snapshot, error, setError, busy, submit, feedback, setFeedback, undo, undoCount, pending, retry, refresh } = useWorkspace()
  const [settings, setSettings] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null), [palette, setPalette] = useState(false)
  const select = (id: string) => { setSelected(id); setHighlighted(id) }
  const [view, setView] = useState<'board' | ListView>('board'), [newRequest, setNewRequest] = useState(0)
  const theme = snapshot?.workspace.theme ?? 'system'
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { setSelected(null); setHighlighted(null); setPalette(false); setSettings(false); setView('board') }, [snapshot?.workspace.generation])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || (!event.metaKey && !event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && !editingTarget(event.target)) { event.preventDefault(); if (!busy) void undo() }
      if (!snapshot?.workspace.setupConfirmedAt || selected || settings) return
      if (key === 'k') { event.preventDefault(); setPalette(true) }
      if (key === 'n' && !editingTarget(event.target)) { event.preventDefault(); setView('board'); setNewRequest(value => value + 1) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo, busy, selected, settings, snapshot?.workspace.setupConfirmedAt])
  return <div className="app-shell">
    <header className="app-header">
      <a href="#main" className="brand" aria-label={messages.home} onClick={() => setView('board')}>goalloom<span className="brand-dot" /></a>
      <div className="toolbar">
        <Button variant="ghost" size="icon" aria-label={messages.settings} onClick={() => setSettings(true)} disabled={!snapshot}><Icon name="settings" /></Button>
        {snapshot?.workspace.setupConfirmedAt && <>
          <Button variant="ghost" size="icon" aria-label={messages.commands} title="Cmd/Ctrl+K" onClick={() => setPalette(true)}><Icon name="search" /></Button>
          <Button variant="ghost" size="icon" aria-label={messages.undoPrevious} title="Cmd/Ctrl+Z" disabled={busy || !undoCount} onClick={() => void undo()}><Icon name="undo" /></Button>
          <Button variant="ghost" onClick={() => void desktopApi().exportWorkspace().catch(() => setError(messages.exportFailed))}><Icon name="export" />{messages.exportWorkspace}</Button>
        </>}
        <div className="theme-picker" role="group" aria-label={messages.theme}>
          {(['system', 'light', 'dark'] as const).map(value => <Button key={value} size="icon" variant="ghost" aria-label={{ system: messages.systemTheme, light: messages.lightTheme, dark: messages.darkTheme }[value]} aria-pressed={theme === value} disabled={busy || !snapshot} onClick={() => void submit({ type: 'preferences', theme: value })}><Icon name={{ system: 'system', light: 'sun', dark: 'moon' }[value] as 'system' | 'sun' | 'moon'} /></Button>)}
        </div>
      </div>
    </header>
    {snapshot?.workspace.setupConfirmedAt && <nav className="view-tabs" aria-label={messages.workspaceViews}>{(['board', 'search', 'done', 'cancelled', 'archived', 'trash'] as const).map(name => <button key={name} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{viewNames[name]}</button>)}{view === 'board' && <button onClick={() => document.querySelector('[data-horizon=day]')?.scrollIntoView({ block: 'nearest', inline: 'end' })}>{messages.jumpToday}</button>}</nav>}
    {snapshot?.workspace.clockAnomaly && <div className="notice-banner">{messages.clockWarning}<Button variant="outline" disabled={busy} onClick={() => void submit({ type: 'confirmClock', confirmed: true })}>{messages.confirmClock}</Button></div>}
    {snapshot?.workspace.calendar && Intl.DateTimeFormat().resolvedOptions().timeZone !== snapshot.workspace.calendar.timezone && <div className="notice-banner">{messages.timezoneMismatch} {snapshot.workspace.calendar.timezone}。</div>}
    {snapshot?.workspace.pausedAfterRestore && <div className="notice-banner">{messages.restorePaused}<Button variant="outline" disabled={busy} onClick={() => void submit({ type: 'confirmRollover', confirmed: true })}>{messages.confirmRollover}</Button></div>}
    {snapshot?.backupError && <div className="notice-banner">{snapshot.backupError}<Button variant="ghost" onClick={() => setSettings(true)}>{messages.viewBackups}</Button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <Button variant="outline" onClick={() => void retry()}>{messages.retry}</Button>}<button aria-label={messages.closeError} onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    {!snapshot ? <main className="setup-page" role="status">{messages.opening}</main> : !snapshot.workspace.setupConfirmedAt ? <Setup submit={submit} busy={busy} /> : <><div className="board-host" hidden={view !== 'board'}><Board key={snapshot.workspace.generation} snapshot={snapshot} submit={submit} busy={busy} select={select} newRequest={newRequest} highlighted={highlighted} /></div>{view !== 'board' && <ItemList key={`${snapshot.workspace.generation}:${view}`} view={view} revision={snapshot.workspace.revision} select={select} timezone={snapshot.workspace.calendar!.timezone} />}</>}
    {settings && snapshot && <Settings snapshot={snapshot} submit={submit} refresh={refresh} busy={busy} close={() => setSettings(false)} />}
    {palette && <CommandPalette close={() => setPalette(false)} navigate={setView} select={select} undo={() => void undo()} canUndo={!busy && undoCount > 0} />}
    {selected && snapshot && <ItemDetail key={`${snapshot.workspace.generation}:${selected}`} itemId={selected} select={select} close={() => setSelected(null)} submit={submit} revision={snapshot.workspace.revision} busy={busy} locate={snapshot.items.some(item => item.id === selected) ? () => { setView('board'); setSelected(null) } : undefined} />}
    {feedback && <div className="toast" key={feedback.result.operationId}><span role="status">{feedback.text}</span>
      {!feedback.result.undoable && !feedback.result.originalOperationId && <Button variant="ghost" onClick={() => setSettings(true)}>{messages.viewBatches}</Button>}
      {feedback.result.undoable && <Button variant="ghost" disabled={busy} onClick={() => void undo(feedback.result.operationId)}>{messages.undo}</Button>}
      {feedback.result.restoreSource && <Button variant="ghost" disabled={busy} onClick={async () => {
        if (!feedback.result.itemId || feedback.result.generation !== snapshot?.workspace.generation) return
        try { const detail = await desktopApi().getItem(feedback.result.itemId); await submit({ type: 'restoreItem', itemId: detail.item.id, expectedVersion: detail.item.version, deletionSource: feedback.result.restoreSource }) }
        catch { setError(messages.restoreItemFailed) }
      }}>{messages.restoreItem}</Button>}
      <Button size="icon" variant="ghost" aria-label={messages.closeFeedback} onClick={() => setFeedback(null)}><Icon name="close" size={16} /></Button>
    </div>}
    <footer><span>{messages.tagline}</span><span role="status">{busy ? messages.saving : snapshot ? messages.connected : messages.connecting}</span></footer>
  </div>
}
