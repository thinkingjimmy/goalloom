/**
 * [INPUT]: 流程列表、当前筛选与视图、命令/设置入口回调。
 * [OUTPUT]: 可拖动窗口的顶栏：流程快捷筛选、搜索、视图菜单与设置。
 * [POS]: renderer 外壳；不读写业务数据，只切换本会话视图状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import type { ListView } from '../../../shared/contracts/queries'
import { messages, viewNames } from '../../i18n/messages'
import type { Flows } from '../../state/flows'
import { Icon } from '../../components/icons'
import { FlowMark } from '../../components/FlowMark'
import { Popover } from '../../components/Popover'

export type View = 'board' | ListView
const menuViews = ['board', 'search', 'done', 'cancelled', 'archived', 'trash'] as const

export function TopBar({ ready, flows, filter, setFilter, view, setView, openSearch, openSettings, jumpToday, active }: {
  ready: boolean; flows: Flows; filter: string | null; setFilter: (id: string | null) => void; view: View; setView: (view: View) => void
  openSearch: () => void; openSettings: () => void; jumpToday: () => void; active: 'search' | 'settings' | null
}) {
  const [menu, setMenu] = useState(false)
  const visible = flows.all.filter(flow => !flow.archived)
  return <header className="titlebar">
    {ready && view === 'board' && <nav className="flow-filter" aria-label={messages.flowFilter}>
      <button className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}><Icon name="all" size={14} strokeWidth={1.8} />{messages.allFlows}</button>
      {visible.map(flow => <button key={flow.id} className="chip" aria-pressed={filter === flow.id} aria-label={messages.onlyFlow(flow.title)} title={flow.title} onClick={() => setFilter(filter === flow.id ? null : flow.id)}>
        <FlowMark colors={[flow.flowColor]} />{filter === flow.id && <span className="chip-label">{flow.title}</span>}
      </button>)}
    </nav>}
    <div className="titlebar-spacer" />
    {ready && <>
      <button className="icon-button" aria-label={messages.commands} title="⌘K" aria-pressed={active === 'search'} onClick={openSearch}><Icon name="search" size={18} /></button>
      <Popover open={menu} onClose={() => setMenu(false)} align="end" anchor={
        <button className="icon-button" aria-label={messages.views} aria-haspopup="menu" aria-expanded={menu} aria-pressed={menu} onClick={() => setMenu(!menu)}><Icon name="views" size={18} /></button>
      }>
        <div role="menu" aria-label={messages.views} className="menu">
          {menuViews.map(name => <button key={name} role="menuitemradio" aria-checked={view === name} className="menu-item" onClick={() => { setView(name); setMenu(false) }}>
            <span className="menu-check">{view === name && <Icon name="check" size={14} strokeWidth={2} />}</span>{viewNames[name]}
          </button>)}
          <div className="menu-separator" />
          <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); jumpToday() }}><span className="menu-check" />{messages.jumpToday}</button>
        </div>
      </Popover>
    </>}
    <button className="icon-button" aria-label={messages.settings} aria-pressed={active === 'settings'} onClick={openSettings}><Icon name="settings" size={18} /></button>
  </header>
}
