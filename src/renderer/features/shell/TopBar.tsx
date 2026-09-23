/**
 * [INPUT]: 流程列表、当前筛选、本机列显示偏好、命令/设置入口回调。
 * [OUTPUT]: 可拖动窗口的顶栏：流程快捷筛选、搜索、列显示勾选浮层与设置。
 * [POS]: renderer 外壳；不读写业务数据，只切换本会话筛选与本机列显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import { horizons } from '../../../shared/contracts/entities'
import { horizonNames, messages } from '../../i18n/messages'
import type { Flows } from '../../state/flows'
import type { Columns } from '../../state/columns'
import { Icon } from '../../components/icons'
import { FlowMark } from '../../components/FlowMark'
import { Popover } from '../../components/Popover'

export function TopBar({ ready, flows, filter, setFilter, columns, openSearch, openSettings, active }: {
  ready: boolean; flows: Flows; filter: string | null; setFilter: (id: string | null) => void; columns: Columns
  openSearch: () => void; openSettings: () => void; active: 'search' | 'settings' | null
}) {
  const [menu, setMenu] = useState(false)
  const visible = flows.all.filter(flow => !flow.archived)
  return <header className="titlebar">
    {ready && <nav className="flow-filter" aria-label={messages.flowFilter}>
      <button className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}><Icon name="all" size={14} strokeWidth={1.8} />{messages.allFlows}</button>
      {visible.map(flow => <button key={flow.id} className="chip" aria-pressed={filter === flow.id} aria-label={messages.onlyFlow(flow.title)} title={flow.title} onClick={() => setFilter(filter === flow.id ? null : flow.id)}>
        <FlowMark colors={[flow.flowColor]} />{filter === flow.id && <span className="chip-label">{flow.title}</span>}
      </button>)}
    </nav>}
    <div className="titlebar-spacer" />
    {ready && <>
      <button className="icon-button" aria-label={messages.commands} title="⌘K" aria-pressed={active === 'search'} onClick={openSearch}><Icon name="search" size={18} /></button>
      <Popover open={menu} onClose={() => setMenu(false)} align="end" anchor={
        <button className="icon-button" aria-label={messages.shownColumns} title={messages.shownColumns} aria-haspopup="menu" aria-expanded={menu} data-marked={columns.hiddenCount > 0} onClick={() => setMenu(!menu)}><Icon name="views" size={18} /></button>
      }>
        <div role="menu" aria-label={messages.shownColumns} className="menu">
          <p className="menu-heading">{messages.shownColumns}</p>
          {horizons.map(horizon => {
            const shown = columns.visible.includes(horizon), last = shown && columns.visible.length === 1
            return <button key={horizon} role="menuitemcheckbox" aria-checked={shown} className="menu-item" disabled={last} title={last ? messages.keepOneColumn : undefined} onClick={() => columns.toggle(horizon)}>
              <span className="menu-checkbox" aria-hidden="true">{shown && <Icon name="check" size={12} strokeWidth={2.4} />}</span>{horizonNames[horizon]}
            </button>
          })}
          {columns.hiddenCount > 0 && <>
            <div className="menu-separator" />
            <button role="menuitem" className="menu-item" onClick={columns.showAll}><span className="menu-checkbox-gap" />{messages.showAllColumns}</button>
          </>}
        </div>
      </Popover>
    </>}
    <button className="icon-button" aria-label={messages.settings} aria-pressed={active === 'settings'} onClick={openSettings}><Icon name="settings" size={18} /></button>
  </header>
}
