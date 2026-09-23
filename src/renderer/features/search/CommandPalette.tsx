import { messages } from '../../i18n/messages'
import { useEffect, useState } from 'react'
import type { Item } from '../../../shared/contracts/entities'
import { desktopApi } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'
import type { ListView } from '../../../shared/contracts/queries'
import { viewNames } from '../../i18n/messages'

export function CommandPalette({ close, navigate, select, undo, canUndo }: { close: () => void; navigate: (view: 'board' | ListView) => void; select: (id: string) => void; undo: () => void; canUndo: boolean }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState<Item[]>([]), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 }).then(page => { if (active) setItems(page.items) }).catch(() => { if (active) setError(messages.searchFailed) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  return <Modal title={messages.commands} close={close}>
    <label>{messages.searchItems}<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={messages.searchPlaceholder} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="command-results">
      {items.map(item => <button key={item.id} onClick={() => { close(); select(item.id) }}>{item.title}{item.archivedAt ? messages.archivedSuffix : ''}</button>)}
      {!query && <>
        {(['board', 'done', 'cancelled', 'archived', 'trash'] as const).map(view => <button key={view} onClick={() => { close(); navigate(view) }}>{viewNames[view]}</button>)}
        <button disabled={!canUndo} onClick={() => { close(); undo() }}>{messages.undoPrevious} <small>Cmd/Ctrl+Z</small></button>
      </>}
      {query && !items.length && <p className="field-note">{messages.noResults}</p>}
    </div>
  </Modal>
}
