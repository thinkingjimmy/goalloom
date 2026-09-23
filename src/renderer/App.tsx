/**
 * [INPUT]: 权威工作区、会话撤销、受限命令和页面组件。
 * [OUTPUT]: 配置/五列/状态视图/详情、持久主题、快捷键和撤销反馈。
 * [POS]: renderer 组合根；工作区代次更换清空旧页面和会话状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import { Icon } from './components/icons'
import { Button } from './components/ui/button'
import { Setup } from './components/Setup'
import { Board } from './components/Board'
import { ItemDetail } from './components/ItemDetail'
import { ItemList, viewNames, type ListView } from './components/ItemList'
import { desktopApi, useWorkspace } from './lib/use-workspace'
import { editingTarget } from './lib/session'
import { CommandPalette } from './components/CommandPalette'

export function App() {
  const { snapshot, error, setError, busy, submit, feedback, setFeedback, undo, undoCount, pending, retry } = useWorkspace()
  const [selected, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null), [palette, setPalette] = useState(false)
  const select = (id: string) => { setSelected(id); setHighlighted(id) }
  const [view, setView] = useState<'board' | ListView>('board'), [newRequest, setNewRequest] = useState(0)
  const theme = snapshot?.workspace.theme ?? 'system'
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { setSelected(null); setHighlighted(null); setPalette(false); setView('board') }, [snapshot?.workspace.generation])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || (!event.metaKey && !event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && !editingTarget(event.target)) { event.preventDefault(); if (!busy) void undo() }
      if (!snapshot?.workspace.setupConfirmedAt || selected) return
      if (key === 'k') { event.preventDefault(); setPalette(true) }
      if (key === 'n' && !editingTarget(event.target)) { event.preventDefault(); setView('board'); setNewRequest(value => value + 1) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo, busy, selected, snapshot?.workspace.setupConfirmedAt])
  return <div className="app-shell">
    <header className="app-header">
      <a href="#main" className="brand" aria-label="Goalloom 首页" onClick={() => setView('board')}>goalloom<span className="brand-dot" /></a>
      <div className="toolbar">
        {snapshot?.workspace.setupConfirmedAt && <>
          <Button variant="ghost" size="icon" aria-label="搜索与命令" title="Cmd/Ctrl+K" onClick={() => setPalette(true)}><Icon name="search" /></Button>
          <Button variant="ghost" size="icon" aria-label="撤销上一步" title="Cmd/Ctrl+Z" disabled={busy || !undoCount} onClick={() => void undo()}><Icon name="undo" /></Button>
          <Button variant="ghost" onClick={() => void desktopApi().exportWorkspace().catch(() => setError('导出失败，请重试'))}><Icon name="export" />导出工作区</Button>
        </>}
        <div className="theme-picker" role="group" aria-label="主题">
          {(['system', 'light', 'dark'] as const).map(value => <Button key={value} size="icon" variant="ghost" aria-label={{ system: '跟随系统', light: '浅色主题', dark: '深色主题' }[value]} aria-pressed={theme === value} disabled={busy || !snapshot} onClick={() => void submit({ type: 'preferences', theme: value })}><Icon name={{ system: 'system', light: 'sun', dark: 'moon' }[value] as 'system' | 'sun' | 'moon'} /></Button>)}
        </div>
      </div>
    </header>
    {snapshot?.workspace.setupConfirmedAt && <nav className="view-tabs" aria-label="工作区视图">{(['board', 'search', 'done', 'cancelled', 'archived', 'trash'] as const).map(name => <button key={name} aria-current={view === name ? 'page' : undefined} onClick={() => setView(name)}>{viewNames[name]}</button>)}</nav>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{pending && <Button variant="outline" onClick={() => void retry()}>重试核对</Button>}<button aria-label="关闭错误提示" onClick={() => setError(null)}><Icon name="close" size={16} /></button></div>}
    {!snapshot ? <main className="setup-page" role="status">正在打开本地工作区…</main> : !snapshot.workspace.setupConfirmedAt ? <Setup submit={submit} busy={busy} /> : <><div className="board-host" hidden={view !== 'board'}><Board snapshot={snapshot} submit={submit} busy={busy} select={select} newRequest={newRequest} highlighted={highlighted} /></div>{view !== 'board' && <ItemList key={view} view={view} revision={snapshot.workspace.revision} select={select} timezone={snapshot.workspace.calendar!.timezone} />}</>}
    {palette && <CommandPalette close={() => setPalette(false)} navigate={setView} select={select} undo={() => void undo()} canUndo={!busy && undoCount > 0} />}
    {selected && snapshot && <ItemDetail key={`${snapshot.workspace.generation}:${selected}`} itemId={selected} select={select} close={() => setSelected(null)} submit={submit} revision={snapshot.workspace.revision} busy={busy} locate={snapshot.items.some(item => item.id === selected) ? () => { setView('board'); setSelected(null) } : undefined} />}
    {feedback && <div className="toast" key={feedback.result.operationId}><span role="status">{feedback.text}</span>
      {feedback.result.undoable && <Button variant="ghost" disabled={busy} onClick={() => void undo(feedback.result.operationId)}>撤销</Button>}
      {feedback.result.restoreSource && <Button variant="ghost" disabled={busy} onClick={async () => {
        if (!feedback.result.itemId || feedback.result.generation !== snapshot?.workspace.generation) return
        try { const detail = await desktopApi().getItem(feedback.result.itemId); await submit({ type: 'restoreItem', itemId: detail.item.id, expectedVersion: detail.item.version, deletionSource: feedback.result.restoreSource }) }
        catch { setError('还原失败，请在回收站检查当前条目') }
      }}>还原</Button>}
      <Button size="icon" variant="ghost" aria-label="关闭操作提示" onClick={() => setFeedback(null)}><Icon name="close" size={16} /></Button>
    </div>}
    <footer><span>把三个月的方向，连接到今天的行动。</span><span role="status">{busy ? '正在保存或核对…' : snapshot ? '已连接本地工作区' : '正在连接…'}</span></footer>
  </div>
}
