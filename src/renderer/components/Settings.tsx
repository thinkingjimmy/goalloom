/**
 * [INPUT]: 权威工作区、固定数据动作 API、受限普通命令。
 * [OUTPUT]: 只读日历、策略/备份设置、批次预览、整库操作的两阶段确认。
 * [POS]: 数据管理 UI；保护备份期间持续只读，确认框每次默认未选。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from '../lib/messages'
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../shared/contracts/queries'
import type { BackupStatus, BatchSummary, DataAction, TransferPreview } from '../../shared/contracts/transfer'
import { desktopApi, type Action } from '../lib/use-workspace'
import { Modal } from './Modal'
import { Button } from './ui/button'
import { horizonNames } from '../lib/messages'

export function Settings({ snapshot, submit, refresh, busy, close }: { snapshot: Snapshot; submit: (action: Action) => Promise<unknown>; refresh: () => Promise<Snapshot>; busy: boolean; close: () => void }) {
  const [backups, setBackups] = useState<BackupStatus | null>(null), [batches, setBatches] = useState<BatchSummary[]>([])
  const [preview, setPreview] = useState<TransferPreview | null>(null), [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [retention, setRetention] = useState(snapshot.workspace.backupRetention)
  const generation = snapshot.workspace.generation
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
  const calendar = snapshot.workspace.calendar
  return <Modal title={messages.settings} close={() => void dismiss()} wide>
    {error && <p className="field-note" role="alert">{error}</p>}
    {working && <p role="status">{messages.checkingData}</p>}
    {preview ? <section className="transfer-preview">
      <h3>{preview.mode === 'reset' ? messages.resetWorkspace : messages.restoreWorkspace}</h3>
      <p>{preview.items}  {messages.itemsUnit}{preview.relations}  {messages.relationsUnit}{preview.periods}  {messages.periodsUnit}{preview.events}  {messages.eventsUnit}{preview.operations}  {messages.operationsUnit}</p>
      {preview.sourceCalendar && <p>{messages.calendarPrefix}{preview.sourceCalendar.timezone}  {messages.weekStartPrefix} {preview.sourceCalendar.weekStart}  {messages.cycleAnchorPrefix} {preview.sourceCalendar.cycleAnchor}</p>}
      {preview.warnings.map(warning => <p className="field-note" key={warning}>{warning}</p>)}
      {!preview.backup ? <>
        <p className="field-note">{preview.mode === 'reset' ? messages.resetNote : messages.restoreNoteFull}{messages.maintenanceNote}</p>
        <Button disabled={working} onClick={() => void data({ type: 'prepare', generation, token: preview.token })}>{messages.prepareBackup}</Button>
      </> : <>
        <div className="backup-receipt"><strong>{messages.backupVerified}</strong><p>{preview.backupPath}</p><small>{preview.backup.size.toLocaleString()}  {messages.bytesUnit} {preview.backup.createdAt}</small></div>
        <p>{messages.maintenanceActive}</p>
        <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{messages.acknowledgeBackup}</label>
        <p className="field-note">{messages.restoreBackupHelp}</p>
        <Button disabled={working || !acknowledged} onClick={() => void data({ type: 'commit', generation, token: preview.token, acknowledged: true })}>{preview.mode === 'reset' ? messages.resetConfirm : messages.restoreConfirm}</Button>
      </>}
      <Button variant="ghost" disabled={working} onClick={() => void data({ type: 'cancel', generation, token: preview.token })}>{messages.cancelData}</Button>
    </section> : <>
      <section><h3>{messages.fixedCalendar}</h3>{calendar ? <><p className="field-note">{calendar.timezone}  {messages.weekStartsPrefix}{[messages.monday, messages.tuesday, messages.wednesday, messages.thursday, messages.friday, messages.saturday, messages.sunday][calendar.weekStart - 1]}{messages.cycleStartsSuffix} {calendar.cycleAnchor}</p><p className="field-note">{messages.calendarLocked}</p></> : <p className="field-note">{messages.setupUnconfirmed}</p>}</section>
      {calendar && <section className="relations-section"><h3>{messages.rolloverSettings}</h3>
        {snapshot.policies.map(policy => <label key={policy.horizon}>{horizonNames[policy.horizon]}<select value={policy.mode} disabled={busy || working || policy.horizon === 'cycle'} onChange={event => void submit({ type: 'policy', horizon: policy.horizon, mode: event.target.value as 'auto' | 'manual', expectedVersion: policy.version })}><option value="manual">{messages.manualMode}</option><option value="auto">{messages.autoMode}</option></select><small className="field-note">{messages.effectiveFrom} {policy.effectiveFromPeriodId.split(':').at(-1)}  {messages.effectiveNote}</small></label>)}
      </section>}
      <section className="relations-section"><h3>{messages.backups}</h3>
        <p className="field-note">{backups?.directory ?? messages.readingBackupPath}</p>
        {backups?.lastError && <p role="alert">{backups.lastError}</p>}
        {calendar && <><label className="check-label"><input type="checkbox" checked={snapshot.workspace.backupEnabled} disabled={busy || working} onChange={event => void submit({ type: 'backupPreferences', enabled: event.target.checked, retention: snapshot.workspace.backupRetention })} />{messages.dailyBackup}</label><label>{messages.retention}<input type="number" min={1} max={100} value={retention} onChange={event => setRetention(Number(event.target.value))} /></label><Button variant="outline" disabled={busy || working || !Number.isInteger(retention) || retention < 1 || retention > 100} onClick={() => void submit({ type: 'backupPreferences', enabled: snapshot.workspace.backupEnabled, retention })}>{messages.saveBackupSettings}</Button></>}
        <p className="field-note">{messages.retentionNote}</p>
        <Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'createBackup', generation })}>{messages.backupNow}</Button>
        <div className="backup-list">{backups?.records.map(record => <div key={record.id}><p>{{ daily: messages.daily, protective: messages.protective, manual: messages.manual }[record.kind]} · {record.createdAt.replace('T', ' ')}<small>{Math.ceil(record.size / 1024)} KB</small></p><Button variant="ghost" disabled={working || busy} onClick={() => void data({ type: 'previewBackup', generation, backupId: record.id })}>{messages.previewRestore}</Button></div>)}</div>
      </section>
      <section className="relations-section"><h3>{messages.workspaceData}</h3><p className="field-note">{messages.importNote}</p><div className="detail-actions"><Button variant="outline" disabled={working || busy} onClick={() => void desktopApi().exportWorkspace().catch(() => setError(messages.exportUnknown))}>{messages.exportJson}</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'chooseImport', format: 'json', generation })}>{messages.importJson}</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'chooseImport', format: 'sqlite', generation })}>{messages.importSqlite}</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'previewReset', generation })}>{messages.resetAction}</Button></div></section>
      <section className="relations-section"><h3>{messages.rolloverBatches}</h3>{!batches.length && <p className="field-note">{messages.noBatches}</p>}{batches.map(batch => <details className="batch-preview" key={batch.id}><summary>{batch.at.replace('T', ' ')} · {batch.total}  {messages.batchUndone} {batch.undone}  {messages.itemUnit}</summary><p className="field-note">{messages.batchUndoNote}</p><ul>{batch.items.map(item => <li key={item.id}>{item.title}<small>{item.from} → {item.to}</small></li>)}</ul><Button variant="outline" disabled={working || busy || batch.undone === batch.total} onClick={() => void submit({ type: 'undoBatch', originalOperationId: batch.id })}>{messages.undoBatch}</Button></details>)}</section>
    </>}
  </Modal>
}
