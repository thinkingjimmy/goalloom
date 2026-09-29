/**
 * [INPUT]: Flows, unfiltered Later TODO count, device sidebar preference and shortcut/navigation controls.
 * [OUTPUT]: Labelled Later tray toggle with its remaining count, unchanged flow filter slots, search and settings.
 * [POS]: Renderer shell; controls presentation without writing workspace data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, horizonNames } from '../../i18n'
import type { Flows } from '../../state/flows'
import type { Columns } from '../../state/columns'
import { ariaKeys, filterCombo, formatCombo, type Bindings } from '../../state/shortcuts'
import { Icon } from '../../components/icons'
import { FlowMark } from '../../components/FlowMark'

export function TopBar({ ready, flows, filter, setFilter, columns, laterTodoCount, bindings, filterKeys, openSearch, openSettings, active }: {
  ready: boolean; flows: Flows; filter: string | null; setFilter: (id: string | null) => void; columns: Columns; bindings: Bindings; filterKeys: boolean
  laterTodoCount: number; openSearch: () => void; openSettings: () => void; active: 'search' | 'settings' | null
}) {
  const combo = (index: number) => filterCombo(filterKeys, index)
  const hint = (label: string, index: number) => [label, formatCombo(combo(index))].filter(Boolean).join('  ')
  return <header className="titlebar">
    {ready && <button id="later-toggle" className="later-toggle" aria-label={messages.laterToggle(columns.laterOpen, laterTodoCount)} title={hint(messages.laterToggle(columns.laterOpen, laterTodoCount), 0)} aria-keyshortcuts={ariaKeys(combo(0))}
      aria-expanded={columns.laterOpen} aria-controls="later-sidebar" onClick={() => columns.setLaterOpen(!columns.laterOpen)}>
      <Icon name="later" size={16} strokeWidth={1.7} /><span aria-hidden="true">{horizonNames.later}</span><span className="later-count" hidden={laterTodoCount === 0} aria-hidden="true">{laterTodoCount}</span>
    </button>}
    {ready && <nav className="flow-filter" aria-label={messages.flowFilter}>
      <button className="chip" aria-pressed={filter === null} title={hint(messages.allFlows, 1)} aria-keyshortcuts={ariaKeys(combo(1))} onClick={() => setFilter(null)}><Icon name="all" size={14} strokeWidth={1.8} />{messages.allFlows}</button>
      {flows.visible.map((flow, index) => <button key={flow.id} className="chip" aria-pressed={filter === flow.id} aria-label={messages.onlyFlow(flow.title)} title={hint(flow.title, index + 2)} aria-keyshortcuts={ariaKeys(combo(index + 2))} onClick={() => setFilter(filter === flow.id ? null : flow.id)}>
        <FlowMark colors={[flow.flowColor]} />{filter === flow.id && <span className="chip-label">{flow.title}</span>}
      </button>)}
    </nav>}
    <div className="titlebar-spacer" />
    {ready && <button className="icon-button" aria-label={messages.commands} title={[messages.commands, formatCombo(bindings.palette)].filter(Boolean).join(' ')} aria-keyshortcuts={ariaKeys(bindings.palette)} aria-pressed={active === 'search'} onClick={openSearch}><Icon name="search" size={18} /></button>}
    <button className="icon-button" aria-label={messages.settings} aria-pressed={active === 'settings'} onClick={openSettings}><Icon name="settings" size={18} /></button>
  </header>
}
