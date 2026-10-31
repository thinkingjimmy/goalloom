/**
 * [INPUT]: A selected task, displayed candidates, bounded current/future search, effective topology and guarded submissions.
 * [OUTPUT]: Keyboard-accessible task search that commits the same nest command as pointer dragging.
 * [POS]: Board outline dialog; authoritative transactions revalidate endpoints and periods.
 */
import { menuStyles } from '../../components/ui/menu'
import { cn } from '../../lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { nestingTargets } from '../../../domain/nesting'
import { compareInstants } from '../../../domain/calendar'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { ItemPage, Snapshot } from '../../../shared/contracts/queries'
import { nestingText } from '../../../shared/i18n/nesting'
import { planningLabel } from '../../lib/periods'
import { messages, horizonNames, useLocale } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'

export function NestingPicker({ itemId, snapshot, candidates, submit, close }: {
  itemId: string; snapshot: Snapshot; candidates: ItemSummary[]; submit: (action: Action) => Promise<unknown>; close: (origin?: 'pointer' | 'keyboard') => void
}) {
  useLocale()
  const t = nestingText(), [query, setQuery] = useState(''), [found, setFound] = useState<{ query: string; page: ItemPage } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const allowed = useMemo(() => nestingTargets(itemId, snapshot.relations.filter(edge => !edge.inheritedFrom), snapshot.nesting ?? []), [itemId, snapshot.relations, snapshot.nesting])
  useEffect(() => {
    if (!query.trim()) return
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 50 })
      .then(page => { if (active) setFound({ query, page }) }).catch(() => { if (active) setError(messages.relationSearchFailed) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const results = found?.query === query ? found.page : null
  const periods = new Map([...snapshot.periods, ...results?.periods ?? []].map(period => [period.id, period]))
  const rows = (query.trim() ? results?.items ?? [] : candidates).filter(item => allowed(item.id) && !item.archivedAt && item.status !== 'cancelled' && !item.deletedAt
    && (!item.placement.periodId || periods.has(item.placement.periodId) && compareInstants(periods.get(item.placement.periodId)!.endAt, snapshot.observedAt) > 0)).slice(0, 50)
  const choose = async (parentId: string, origin: 'pointer' | 'keyboard') => {
    setBusy(true); setError('')
    try {
      const [source, target] = await Promise.all([desktopApi().getItem(itemId), desktopApi().getItem(parentId)])
      const shown = rows.find(item => item.id === parentId)
      if (!shown || shown.placement.horizon !== target.item.placement.horizon || shown.placement.periodId !== target.item.placement.periodId) { setError(t.changed); return }
      const result = await submit({ type: 'nest', itemId, parentId, expectedVersion: source.item.version, expectedParentVersion: target.item.version,
        expectedPlacementVersion: source.item.placement.version, expectedParentPlacementVersion: target.item.placement.version })
      if (result) close(origin)
    } catch { setError(t.changed) }
    finally { setBusy(false) }
  }
  return <Modal title={t.choose} close={() => close()} className="nesting-picker">
    <input className="menu-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label={t.search} placeholder={t.search} disabled={busy} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="nesting-choices">{rows.map(item => <button key={item.id} type="button" className={cn(menuStyles.item, 'menu-item')} disabled={busy} onClick={event => void choose(item.id, event.detail > 0 ? 'pointer' : 'keyboard')}>
      <span className={cn(menuStyles.text, 'menu-text')}>{item.title}</span><span className={cn(menuStyles.hint, 'menu-hint')}>{item.placement.periodId && periods.has(item.placement.periodId) ? planningLabel(periods.get(item.placement.periodId)!, snapshot.workspace.calendar!, snapshot.observedAt) : horizonNames[item.placement.horizon]}</span>
    </button>)}{!rows.length && <p className="menu-note">{messages.noResults}</p>}</div>
  </Modal>
}
