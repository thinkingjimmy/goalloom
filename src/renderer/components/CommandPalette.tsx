import { useEffect, useState } from 'react'
import type { Item } from '../../shared/contracts/entities'
import { desktopApi } from '../lib/use-workspace'
import { Modal } from './Modal'
import { viewNames, type ListView } from './ItemList'

export function CommandPalette({ close, navigate, select, undo, canUndo }: { close: () => void; navigate: (view: 'board' | ListView) => void; select: (id: string) => void; undo: () => void; canUndo: boolean }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState<Item[]>([]), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 }).then(page => { if (active) setItems(page.items) }).catch(() => { if (active) setError('搜索失败，请重试') }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  return <Modal title="搜索与命令" close={close}>
    <label>搜索条目<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="输入标题或说明…" /></label>
    {error && <p role="alert">{error}</p>}
    <div className="command-results">
      {items.map(item => <button key={item.id} onClick={() => { close(); select(item.id) }}>{item.title}{item.archivedAt ? ' · 已归档' : ''}</button>)}
      {!query && <>
        {(['board', 'done', 'cancelled', 'archived', 'trash'] as const).map(view => <button key={view} onClick={() => { close(); navigate(view) }}>{viewNames[view]}</button>)}
        <button disabled={!canUndo} onClick={() => { close(); undo() }}>撤销上一步 <small>Cmd/Ctrl+Z</small></button>
      </>}
      {query && !items.length && <p className="field-note">没有找到条目</p>}
    </div>
  </Modal>
}
