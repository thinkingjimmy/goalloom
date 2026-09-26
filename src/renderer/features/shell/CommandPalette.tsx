/**
 * [INPUT]: Bounded search API, navigation callbacks and local shortcut bindings.
 * [OUTPUT]: IME-aware debounced results and recoverable errors keyed to a nonempty query.
 * [POS]: Read-only global search; never presents a stale response as current.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, horizonNames, statusNames, shortcutMessages } from '../../i18n'
import { useEffect, useState } from 'react'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Section } from './settings/Settings'
import { desktopApi } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/icons'
import { formatCombo, type Bindings } from '../../state/shortcuts'

interface Entry { key: string; label: string; hint: string; disabled?: boolean; run: () => void }
export function CommandPalette({ close, select, undo, canUndo, create, openSettings, bindings }: { close: () => void; select: (id: string) => void; undo: () => void; canUndo: boolean; create: () => void; openSettings: (section?: Section) => void; bindings: Bindings }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState<ItemSummary[]>([]), [error, setError] = useState('')
  const [composing, setComposing] = useState(false), [presented, setPresented] = useState('')
  useEffect(() => {
    setError('')
    if (!query.trim()) { setItems([]); setPresented(''); return }
    if (composing) return
    let active = true
    const timer = setTimeout(() => { void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 }).then(page => { if (active) { setItems(page.items); setPresented(query) } }).catch(() => { if (active) setError(messages.searchFailed) }) }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query, composing])

  const done = (action: () => void) => () => { close(); action() }
  const entries: Entry[] = query.trim()
    ? (presented === query && !composing ? items : []).map(item => ({ key: item.id, label: item.title, hint: `${horizonNames[item.placement.horizon]}${item.status !== 'todo' ? ` · ${statusNames[item.status]}` : ''}${item.archivedAt ? messages.archivedSuffix : ''}`, run: done(() => select(item.id)) }))
    : [
      { key: 'new', label: messages.newItem, hint: formatCombo(bindings.compose), run: done(create) },
      { key: 'undo', label: messages.undoPrevious, hint: formatCombo(bindings.undo), disabled: !canUndo, run: done(undo) },
      { key: 'done', label: messages.done, hint: messages.settings, run: done(() => openSettings('done')) },
      { key: 'trash', label: messages.trash, hint: messages.settings, run: done(() => openSettings('trash')) },
      { key: 'shortcuts', label: shortcutMessages.section, hint: messages.settings, run: done(() => openSettings('shortcuts')) },
      { key: 'settings', label: messages.settings, hint: formatCombo(bindings.settings), run: done(() => openSettings()) },
    ]
  return <Modal title={messages.commands} heading={<div className="palette-search"><Icon name="search" size={18} /><input autoFocus aria-label={messages.searchItems} value={query} onChange={event => setQuery(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setQuery(event.currentTarget.value); setComposing(false) }} placeholder={messages.searchOrCommand}
    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); const first = entries.find(entry => !entry.disabled); first?.run() } }} /></div>} close={close} className="palette">
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="menu-heading">{query.trim() ? messages.itemsHeading : messages.commandsHeading}</p>
    <div className="command-results">
      {entries.map(entry => <button key={entry.key} className="menu-item" disabled={entry.disabled} onClick={entry.run}><span className="menu-text">{entry.label}</span>{entry.hint && <span className="menu-hint">{entry.hint}</span>}</button>)}
      {query.trim() && presented === query && !composing && !items.length && <p className="menu-note">{messages.noResults}</p>}
    </div>
  </Modal>
}
