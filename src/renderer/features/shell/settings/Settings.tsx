/**
 * [INPUT]: Workspace, narrow data/actions API and device preferences.
 * [OUTPUT]: Settings navigation with colored pause icons and update status, section headings, item-filter counts, section-scoped backup reads and AI status refresh.
 * [POS]: Data-management container; protective preparation locks navigation and confirmation starts unchecked.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../../../shared/contracts/queries'
import type { BackupStatus, DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { workspaceDate } from '../../../../domain/calendar'
import { insightMessages, messages, settingsMessages as s, shortcutMessages, smartMessages, useLocale } from '../../../i18n'
import { desktopApi, type Action } from '../../../state/use-workspace'
import type { Ai } from '../../../state/ai'
import { Modal } from '../../../components/Modal'
import { Icon, type IconName } from '../../../components/icons'
import { AppearancePane } from './AppearancePane'
import { BoardPane } from './BoardPane'
import { CalendarPane } from './CalendarPane'
import { BackupPane } from './BackupPane'
import { AiPane } from './AiPane'
import { SmartPane } from './SmartPane'
import { InsightPane } from './InsightPane'
import { ShortcutsPane } from './ShortcutsPane'
import { ItemsPane, type ItemsView } from './ItemsPane'
import { AboutPane } from './AboutPane'
import { hasUpdate, useUpdate } from '../../../state/update'
import { Segmented } from './parts'
import { TransferReview, TransferSteps } from './TransferReview'
import './settings.css'

export type Section = 'appearance' | 'board' | 'shortcuts' | 'ai' | 'smart' | 'insight' | 'calendar' | 'backup' | 'done' | 'trash' | 'about'
interface Entry { id: Section; label: string; icon: IconName }
// Built per render so every label follows the current language.
const groups = (): { label: string; entries: Entry[] }[] => [
  { label: s.preferences, entries: [
    { id: 'appearance', label: messages.appearance, icon: 'appearance' },
    { id: 'shortcuts', label: shortcutMessages.section, icon: 'keyboard' },
  ] },
  { label: smartMessages.aiGroup, entries: [
    { id: 'ai', label: smartMessages.aiSection, icon: 'key' },
    { id: 'smart', label: smartMessages.sectionTitle, icon: 'smart' },
    { id: 'insight', label: insightMessages.settingsSection, icon: 'split' },
  ] },
  { label: s.workspace, entries: [
    { id: 'board', label: s.board, icon: 'views' },
    { id: 'calendar', label: messages.calendarSection, icon: 'calendar' },
    { id: 'backup', label: s.backupSection, icon: 'backup' },
  ] },
  { label: s.items, entries: [
    { id: 'done', label: messages.done, icon: 'check' },
    { id: 'trash', label: messages.trash, icon: 'delete' },
  ] },
  // The product name needs no translation, so it doubles as the group label.
  { label: 'Goalloom', entries: [
    { id: 'about', label: s.about.section, icon: 'info' },
  ] },
]
const endings = ['done', 'cancelled', 'archived'] as const
type Ending = typeof endings[number]
const endingLabels = (): Record<Ending, string> => ({ done: messages.doneShort, cancelled: messages.cancelledShort, archived: messages.archive })
type Counts = Record<Ending | 'trash', number>

export function Settings({ snapshot, ai, initial = 'appearance', request = 0, submit, refresh, busy, select, close }: { snapshot: Snapshot; ai: Ai; initial?: Section; request?: number; submit: (action: Action) => Promise<unknown>; refresh: () => Promise<Snapshot>; busy: boolean; select: (id: string) => void; close: () => void }) {
  useLocale()
  const [section, setSection] = useState<Section>(initial), [ending, setEnding] = useState<Ending>('done')
  // Set only by the calendar pane's change row so Backup opens on its reset entry; any other navigation clears it.
  const [revealReset, setRevealReset] = useState(false)
  const navigate = (next: Section, reset = false) => { setSection(next); setRevealReset(reset) }
  const [backups, setBackups] = useState<BackupStatus | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [preview, setPreview] = useState<TransferPreview | null>(null), [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false), [error, setError] = useState('')
  // A new request (e.g. the app menu's About) re-targets an open dialog, except while a transfer review locks navigation.
  useEffect(() => { if (!preview) navigate(initial) }, [request])
  const update = useUpdate()
  const { generation, calendar, revision } = snapshot.workspace
  const timezone = calendar?.timezone
  const today = calendar ? workspaceDate(calendar.timezone, snapshot.observedAt) : ''
  const reload = async (active: () => boolean = () => true) => {
    const totals = await desktopApi().getCounts()
    if (!active()) return
    setCounts(totals)
    if (section === 'backup') {
      const reply = await desktopApi().data({ type: 'backupStatus' })
      if (active() && reply.type === 'status') setBackups(reply.status)
    }
  }
  // Provider failures are recorded in main while Settings is closed; re-read them whenever an AI section opens.
  const aiSection = section === 'ai' || section === 'smart' || section === 'insight'
  useEffect(() => { void ai.refresh() }, [aiSection])
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
  const featureMeta = (feature: 'smart' | 'insight') => ai.status?.features[feature].enabled ? { text: s.enabledMeta, dot: true as const } : ai.status?.features[feature].paused ? { text: smartMessages.pausedMeta, icon: 'pause' as const } : null
  const meta: Partial<Record<Section, { text: string; dot?: true | 'update'; icon?: 'pause' }>> = {
    ...(featureMeta('smart') && { smart: featureMeta('smart')! }),
    ...(featureMeta('insight') && { insight: featureMeta('insight')! }),
    ...(hasUpdate(update) && { about: { text: s.about.navMeta, dot: 'update' as const } }),
  }
  const title = preview ? (preview.mode === 'reset' ? messages.resetWorkspace : messages.restoreWorkspace) : groups().flatMap(group => group.entries).find(entry => entry.id === section)!.label
  const subtitle = preview ? '' : section === 'shortcuts' ? shortcutMessages.subtitle : section === 'done' ? '' : s.subtitles[section]
  const heading = <>
    <div className="settings-heading">
      <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
      {!preview && section === 'shortcuts' && <p className="settings-shortcut-note">{shortcutMessages.conflictNote}</p>}
    </div>
    {preview && <TransferSteps backedUp={!!preview.backup} />}
    {!preview && section === 'done' && <Segmented label={messages.endingFilter} value={ending} onChange={setEnding}
      options={endings.map(value => ({ value, label: endingLabels()[value], count: counts?.[value] }))} />}
  </>
  const items = section === 'done' ? ending : section === 'trash' ? 'trash' : null
  const status = <>
    {error && <p className="settings-alert" role="alert">{error}</p>}
    {working && <p className="settings-footnote" role="status">{messages.checkingData}</p>}
  </>

  return <Modal title={messages.settings} heading={heading} close={() => void dismiss()} className="settings-modal">
    <nav className="settings-nav" aria-label={messages.settingsSections} data-locked={!!preview}>
      <p className="settings-nav-title">{messages.settings}</p>
      {groups().map(group => <div key={group.label} className="settings-nav-group">
        <p>{group.label}</p>
        {group.entries.map(entry => {
          const status = meta[entry.id]
          return <button key={entry.id} type="button" aria-current={!preview && section === entry.id ? 'page' : undefined} aria-description={status?.text} disabled={!!preview} onClick={() => navigate(entry.id)}>
            <Icon name={entry.icon} size={16} /><span className="settings-nav-label">{entry.label}</span>
            {/* The section name stays the button's accessible name; status is its description. */}
            {status && <span className="settings-nav-meta" data-dot={status.dot ?? false} data-icon={status.icon} title={status.icon ? status.text : undefined} aria-hidden="true">
              {status.icon ? <Icon name={status.icon} size={14} /> : status.text}
            </span>}
          </button>
        })}
      </div>)}
      {preview && <p className="settings-nav-note"><Icon name="lock" size={14} /><span>{messages.maintenanceNav}</span></p>}
    </nav>
    {preview
      ? <TransferReview preview={preview} working={working} acknowledged={acknowledged} acknowledge={setAcknowledged} timezone={timezone} generation={generation} data={data}>{status}</TransferReview>
      : <div className="settings-body">
        {status}
        {section === 'appearance' && <AppearancePane workspace={snapshot.workspace} disabled={disabled} submit={submit} />}
        {section === 'board' && <BoardPane disabled={disabled} submit={submit} />}
        {section === 'shortcuts' && <ShortcutsPane />}
        {section === 'ai' && <AiPane ai={ai} />}
        {section === 'smart' && <SmartPane ai={ai} goto={next => navigate(next)} />}
        {section === 'insight' && <InsightPane snapshot={snapshot} ai={ai} goto={next => navigate(next)} />}
        {section === 'calendar' && (calendar
          ? <CalendarPane calendar={calendar} policies={snapshot.policies} observedAt={snapshot.observedAt} today={today} disabled={disabled} submit={submit} goReset={() => navigate('backup', true)} />
          : <p className="settings-footnote">{messages.setupUnconfirmed}</p>)}
        {section === 'backup' && <BackupPane status={backups} enabled={snapshot.workspace.backupEnabled} retention={snapshot.workspace.backupRetention} timezone={timezone} today={today} generation={generation} configured={!!calendar} disabled={disabled} submit={submit} data={data} revealReset={revealReset}
          exportJson={() => void desktopApi().exportWorkspace().catch(() => setError(messages.exportUnknown))} />}
        {section === 'about' && <AboutPane info={update} />}
        {items && calendar && <ItemsPane key={items} view={items as ItemsView} revision={revision} timezone={calendar.timezone} today={today} disabled={disabled} select={select} submit={submit} />}
      </div>}
  </Modal>
}
