/**
 * [INPUT]: 权威工作区、固定数据动作 API、受限普通命令、设备侧智能输入状态。
 * [OUTPUT]: 左侧分类导航 + 右侧分组面板的设置弹窗；整库操作切换为 TransferReview 两阶段确认。
 * [POS]: 数据管理 UI 的容器：持有备份/批次读取、数据动作与预览状态；保护备份期间锁定导航，确认框每次默认未选。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../../../shared/contracts/queries'
import type { BackupStatus, BatchSummary, DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { messages } from '../../../i18n/messages'
import { desktopApi, type Action } from '../../../state/use-workspace'
import { Modal } from '../../../components/Modal'
import { Icon, type IconName } from '../../../components/icons'
import { AppearancePane } from './AppearancePane'
import { CalendarPane } from './CalendarPane'
import { BackupPane } from './BackupPane'
import { DataPane } from './DataPane'
import { SmartPane } from './SmartPane'
import type { Smart } from '../../../state/smart'
import { TransferReview, TransferSteps } from './TransferReview'

export type Section = 'appearance' | 'smart' | 'calendar' | 'backup' | 'data'
const sections: { id: Section; label: string; icon: IconName }[] = [
  { id: 'appearance', label: messages.appearance, icon: 'appearance' },
  { id: 'smart', label: '智能输入', icon: 'smart' },
  { id: 'calendar', label: messages.calendarSection, icon: 'calendar' },
  { id: 'backup', label: messages.backups, icon: 'backup' },
  { id: 'data', label: messages.dataSection, icon: 'transfer' },
]

export function Settings({ snapshot, smart, initial = 'appearance', submit, refresh, busy, close }: { snapshot: Snapshot; smart: Smart; initial?: Section; submit: (action: Action) => Promise<unknown>; refresh: () => Promise<Snapshot>; busy: boolean; close: () => void }) {
  const [section, setSection] = useState<Section>(initial)
  const [backups, setBackups] = useState<BackupStatus | null>(null), [batches, setBatches] = useState<BatchSummary[]>([])
  const [preview, setPreview] = useState<TransferPreview | null>(null), [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false), [error, setError] = useState('')
  const { generation, calendar } = snapshot.workspace
  const timezone = calendar?.timezone
  const reload = async () => {
    const [reply, batches] = await Promise.all([desktopApi().data({ type: 'backupStatus' }), desktopApi().getBatches()])
    if (reply.type === 'status') setBackups(reply.status)
    setBatches(batches)
  }
  useEffect(() => { void reload().catch(() => setError(messages.backupStatusFailed)) }, [generation, snapshot.workspace.revision])
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
  const title = preview ? (preview.mode === 'reset' ? messages.resetWorkspace : messages.restoreWorkspace) : sections.find(entry => entry.id === section)!.label
  const heading = <><h2>{title}</h2>{preview && <TransferSteps backedUp={!!preview.backup} />}</>
  const status = <>
    {error && <p className="settings-alert" role="alert">{error}</p>}
    {working && <p className="settings-footnote" role="status">{messages.checkingData}</p>}
  </>

  return <Modal title={messages.settings} heading={heading} close={() => void dismiss()} className="settings-modal">
    <nav className="settings-nav" aria-label={messages.settingsSections} data-locked={!!preview}>
      <p className="settings-nav-title">{messages.settings}</p>
      {sections.map(entry => <button key={entry.id} type="button" aria-current={!preview && section === entry.id ? 'page' : undefined} disabled={!!preview} onClick={() => setSection(entry.id)}>
        <Icon name={entry.icon} size={16} />{entry.label}
      </button>)}
      {preview && <small className="settings-nav-note">{messages.maintenanceNav}</small>}
    </nav>
    {preview
      ? <TransferReview preview={preview} working={working} acknowledged={acknowledged} acknowledge={setAcknowledged} timezone={timezone} generation={generation} data={data}>{status}</TransferReview>
      : <div className="settings-body">
        {status}
        {section === 'appearance' && <AppearancePane workspace={snapshot.workspace} disabled={disabled} submit={submit} />}
        {section === 'smart' && <SmartPane smart={smart} />}
        {section === 'calendar' && (calendar
          ? <CalendarPane calendar={calendar} policies={snapshot.policies} batches={batches} disabled={disabled} submit={submit} goReset={() => setSection('data')} />
          : <p className="settings-footnote">{messages.setupUnconfirmed}</p>)}
        {section === 'backup' && <BackupPane status={backups} enabled={snapshot.workspace.backupEnabled} retention={snapshot.workspace.backupRetention} timezone={timezone} generation={generation} configured={!!calendar} disabled={disabled} submit={submit} data={data} />}
        {section === 'data' && <DataPane generation={generation} disabled={disabled} exportJson={() => void desktopApi().exportWorkspace().catch(() => setError(messages.exportUnknown))} data={data} />}
      </div>}
  </Modal>
}
