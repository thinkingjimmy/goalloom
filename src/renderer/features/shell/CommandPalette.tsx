/**
 * [INPUT]: Bounded search API, navigation callbacks and local shortcut bindings.
 * [OUTPUT]: IME-aware debounced results keyed to the current query and bounded page timing marks.
 * [POS]: Read-only global search; never presents a stale response as current.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, horizonNames, statusNames, shortcutMessages } from '../../i18n'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const timing = useRef({ id: 0, input: performance.now(), debounce: 0, api: 0 })
  const sequence = useRef(0)
  useEffect(() => {
    if (composing) return
    let active = true
    const sample = timing.current
    const timer = setTimeout(() => { sample.debounce = performance.now(); void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 20 }).then(page => { if (active) { sample.api = performance.now(); setItems(page.items); setPresented(query) } }).catch(() => { if (active) setError(messages.searchFailed) }) }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query, composing])
  useLayoutEffect(() => {
    const sample = timing.current
    if (presented !== query || !sample.api) return
    const commit = performance.now()
    const frame = requestAnimationFrame(() => {
      const nextFrame = performance.now()
      // A bounded User Timing record contains durations and identity, never the query.
      performance.clearMeasures('goalloom.search')
      performance.measure('goalloom.search', { start: sample.input, end: nextFrame, detail: { id: sample.id, debounceMs: sample.debounce - sample.input, apiMs: sample.api - sample.debounce, commitMs: commit - sample.api, inputToFrameMs: nextFrame - sample.input, debounceToFrameMs: nextFrame - sample.debounce } })
    })
    return () => cancelAnimationFrame(frame)
  }, [presented, items, query])
  const changeQuery = (value: string) => { timing.current = { id: ++sequence.current, input: performance.now(), debounce: 0, api: 0 }; setQuery(value) }

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
  return <Modal title={messages.commands} heading={<div className="palette-search"><Icon name="search" size={18} /><input autoFocus aria-label={messages.searchItems} value={query} onChange={event => changeQuery(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { changeQuery(event.currentTarget.value); setComposing(false) }} placeholder={messages.searchOrCommand}
    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); const first = entries.find(entry => !entry.disabled); first?.run() } }} /></div>} close={close} className="palette">
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="menu-heading">{query.trim() ? messages.itemsHeading : messages.commandsHeading}</p>
    <div className="command-results" data-query={presented}>
      {entries.map(entry => <button key={entry.key} className="menu-item" disabled={entry.disabled} onClick={entry.run}><span className="menu-text">{entry.label}</span>{entry.hint && <span className="menu-hint">{entry.hint}</span>}</button>)}
      {query.trim() && !items.length && <p className="menu-note">{messages.noResults}</p>}
    </div>
  </Modal>
}
