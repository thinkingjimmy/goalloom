/**
 * [INPUT]: Workspace, narrow data/actions API and device preferences.
 * [OUTPUT]: Settings navigation, lightweight counts and section-scoped backup/batch reads.
 * [POS]: Data-management container; protective preparation locks navigation and confirmation starts unchecked.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../../../shared/contracts/queries'
import type { BackupStatus, BatchSummary, DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { workspaceDate } from '../../../../domain/calendar'
import { messages, settingsMessages as s, shortcutMessages, smartMessages } from '../../../i18n'
import { useShortcuts } from '../../../state/shortcuts'
import { desktopApi, type Action } from '../../../state/use-workspace'
import type { Smart } from '../../../state/smart'
import { Modal } from '../../../components/Modal'
import { Kbd } from '../../../components/Kbd'
import { Icon, type IconName } from '../../../components/icons'
import { AppearancePane } from './AppearancePane'
import { CalendarPane } from './CalendarPane'
import { BackupPane } from './BackupPane'
import { SmartPane } from './SmartPane'
import { ShortcutsPane } from './ShortcutsPane'
import { ItemsPane, type ItemsView } from './ItemsPane'
import { Segmented, relativeDay } from './parts'
import { TransferReview, TransferSteps } from './TransferReview'
import './settings.css'

export type Section = 'appearance' | 'shortcuts' | 'smart' | 'calendar' | 'backup' | 'done' | 'trash'
interface Entry { id: Section; label: string; icon: IconName }
// Built per render so every label follows the current language.
const groups = (): { label: string; entries: Entry[] }[] => [
  { label: s.preferences, entries: [
    { id: 'appearance', label: messages.appearance, icon: 'appearance' },
    { id: 'shortcuts', label: shortcutMessages.section, icon: 'keyboard' },
    { id: 'smart', label: smartMessages.sectionTitle, icon: 'smart' },
  ] },
  { label: s.workspace, entries: [
    { id: 'calendar', label: messages.calendarSection, icon: 'calendar' },
    { id: 'backup', label: s.backupSection, icon: 'backup' },
  ] },
  { label: s.items, entries: [
    { id: 'done', label: messages.done, icon: 'check' },
    { id: 'trash', label: messages.trash, icon: 'delete' },
  ] },
]
const endings = ['done', 'cancelled', 'archived'] as const
type Ending = typeof endings[number]
const endingLabels = (): Record<Ending, string> => ({ done: messages.doneShort, cancelled: messages.cancelledShort, archived: messages.archive })
type Counts = Record<Ending | 'trash', number>

export function Settings({ snapshot, smart, initial = 'appearance', submit, refresh, busy, select, close }: { snapshot: Snapshot; smart: Smart; initial?: Section; submit: (action: Action) => Promise<unknown>; refresh: () => Promise<Snapshot>; busy: boolean; select: (id: string) => void; close: () => void }) {
  const [section, setSection] = useState<Section>(initial), [ending, setEnding] = useState<Ending>('done')
  const [backups, setBackups] = useState<BackupStatus | null>(null), [batches, setBatches] = useState<BatchSummary[]>([])
  const [latest, setLatest] = useState<string | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [preview, setPreview] = useState<TransferPreview | null>(null), [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false), [error, setError] = useState('')
  const shortcuts = useShortcuts()
  const { generation, calendar, revision } = snapshot.workspace
  const timezone = calendar?.timezone
  const today = calendar ? workspaceDate(calendar.timezone, snapshot.observedAt) : ''
  const reload = async (active: () => boolean = () => true) => {
    const [summary, totals] = await Promise.all([desktopApi().getBackupSummary(), desktopApi().getCounts()])
    if (!active()) return
    setLatest(summary.latest); setCounts(totals)
    if (section === 'backup') {
      const reply = await desktopApi().data({ type: 'backupStatus' })
      if (active() && reply.type === 'status') setBackups(reply.status)
    }
    if (section === 'calendar') {
      const next = await desktopApi().getBatches()
      if (active()) setBatches(next)
    }
  }
  useEffect(() => {
    let active = true
    void reload(() => active).catch(() => { if (active) setError(messages.backupStatusFailed) })
    return () => { active = false }
  }, [generation, revision, section])
  const data = async (action: DataAction) => {
    setWorking(true); setError('')
    try {
      const reply = await desktopApi().data(action)
      if (reply.type === 'preview') { setPreview(reply.preview); setAcknowledged(false) }
      if (reply.type === 'status') setBackups(reply.status)
      if (reply.type === 'cancelled') setPreview(null)
      await refresh()
      if (reply.type === 'replaced') { close(); return }
      await reload()
    } catch (error) {
      setError(error instanceof Error ? error.message : messages.transferUnknown)
      const current = await refresh().catch(() => null)
      if (current && !current.maintenance && ['prepare', 'commit', 'cancel'].includes(action.type)) {
        setPreview(null); setAcknowledged(false)
      }
    } finally { setWorking(false) }
  }
  const dismiss = async () => {
    if (working) return
    if (preview) {
      try { await desktopApi().data({ type: 'cancel', generation, token: preview.token }); await refresh() }
      catch { setError(messages.cancelUnknown); return }
    }
    close()
  }
  const disabled = busy || working
  const meta: Partial<Record<Section, { text: string; dot?: boolean }>> = {
    ...(smart.status?.enabled && { smart: { text: s.enabledMeta, dot: true } }),
    ...(latest && today && { backup: { text: relativeDay(latest, today, timezone, s) } }),
    ...(counts?.trash && { trash: { text: String(counts.trash) } }),
  }
  const title = preview ? (preview.mode === 'reset' ? messages.resetWorkspace : messages.restoreWorkspace) : groups().flatMap(group => group.entries).find(entry => entry.id === section)!.label
  const subtitle = preview ? '' : section === 'shortcuts' ? shortcutMessages.subtitle : section === 'done' ? '' : s.subtitles[section]
  const heading = <>
    <div className="settings-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {preview && <TransferSteps backedUp={!!preview.backup} />}
    {!preview && section === 'done' && <Segmented label={messages.endingFilter} value={ending} onChange={setEnding}
      options={endings.map(value => ({ value, label: endingLabels()[value], count: counts?.[value] }))} />}
  </>
  const actions = !preview && section === 'shortcuts'
    ? <button type="button" className="settings-button" disabled={!shortcuts.customized} onClick={shortcuts.reset}>{shortcutMessages.restore}</button>
    : undefined
  const items = section === 'done' ? ending : section === 'trash' ? 'trash' : null
  const status = <>
    {error && <p className="settings-alert" role="alert">{error}</p>}
    {working && <p className="settings-footnote" role="status">{messages.checkingData}</p>}
  </>

  return <Modal title={messages.settings} heading={heading} actions={actions} close={() => void dismiss()} className="settings-modal">
    <nav className="settings-nav" aria-label={messages.settingsSections} data-locked={!!preview}>
      <p className="settings-nav-title">{messages.settings}</p>
      {groups().map(group => <div key={group.label} className="settings-nav-group">
        <p>{group.label}</p>
        {group.entries.map(entry => <button key={entry.id} type="button" aria-current={!preview && section === entry.id ? 'page' : undefined} disabled={!!preview} onClick={() => setSection(entry.id)}>
          <Icon name={entry.icon} size={16} /><span className="settings-nav-label">{entry.label}</span>
          {/* Glanceable status only; the section name stays the button's accessible name. */}
          {meta[entry.id] && <span className="settings-nav-meta" data-dot={!!meta[entry.id]!.dot} aria-hidden="true">{meta[entry.id]!.text}</span>}
        </button>)}
      </div>)}
      {preview
        ? <p className="settings-nav-note"><Icon name="lock" size={14} /><span>{messages.maintenanceNav}</span></p>
        : shortcuts.bindings.settings && <p className="settings-nav-hint"><Kbd combo={shortcuts.bindings.settings} /><span>{s.openAnytime}</span></p>}
    </nav>
    {preview
      ? <TransferReview preview={preview} working={working} acknowledged={acknowledged} acknowledge={setAcknowledged} timezone={timezone} generation={generation} data={data}>{status}</TransferReview>
      : <div className="settings-body">
        {status}
        {section === 'appearance' && <AppearancePane workspace={snapshot.workspace} disabled={disabled} submit={submit} />}
        {section === 'shortcuts' && <ShortcutsPane />}
        {section === 'smart' && <SmartPane smart={smart} />}
        {section === 'calendar' && (calendar
          ? <CalendarPane calendar={calendar} policies={snapshot.policies} batches={batches} today={today} disabled={disabled} submit={submit} goReset={() => setSection('backup')} />
          : <p className="settings-footnote">{messages.setupUnconfirmed}</p>)}
        {section === 'backup' && <BackupPane status={backups} enabled={snapshot.workspace.backupEnabled} retention={snapshot.workspace.backupRetention} timezone={timezone} today={today} generation={generation} configured={!!calendar} disabled={disabled} submit={submit} data={data}
          exportJson={() => void desktopApi().exportWorkspace().catch(() => setError(messages.exportUnknown))} />}
        {items && calendar && <ItemsPane key={items} view={items as ItemsView} revision={revision} timezone={calendar.timezone} today={today} disabled={disabled} select={select} submit={submit} />}
      </div>}
  </Modal>
}
