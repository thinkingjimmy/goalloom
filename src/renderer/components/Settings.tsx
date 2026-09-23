/**
 * [INPUT]: 权威工作区、固定数据动作 API、受限普通命令。
 * [OUTPUT]: 只读日历、策略/备份设置、批次预览、整库操作的两阶段确认。
 * [POS]: 数据管理 UI；保护备份期间持续只读，确认框每次默认未选。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import type { Snapshot } from '../../shared/contracts/queries'
import type { BackupStatus, BatchSummary, DataAction, TransferPreview } from '../../shared/contracts/transfer'
import { desktopApi, type Action } from '../lib/use-workspace'
import { Modal } from './Modal'
import { Button } from './ui/button'
import { horizonNames } from './ItemDetail'

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
  useEffect(() => { void reload().catch(() => setError('无法读取备份状态，请重试')) }, [generation, snapshot.workspace.revision])
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
      setError(error instanceof Error ? error.message : '数据操作结果未确认，请检查当前工作区和备份状态')
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
      catch { setError('尚未确认取消，请重试或重新启动应用核对'); return }
    }
    close()
  }
  const calendar = snapshot.workspace.calendar
  return <Modal title="设置与数据" close={() => void dismiss()} wide>
    {error && <p className="field-note" role="alert">{error}</p>}
    {working && <p role="status">正在核对数据与备份，请稍候…</p>}
    {preview ? <section className="transfer-preview">
      <h3>{preview.mode === 'reset' ? '重置工作区' : '恢复工作区'}</h3>
      <p>{preview.items} 个条目（含归档与回收站）、{preview.relations} 条关系、{preview.periods} 个周期、{preview.events} 条活动、{preview.operations} 个操作回执。</p>
      {preview.sourceCalendar && <p>日历：{preview.sourceCalendar.timezone} · 周起始日 {preview.sourceCalendar.weekStart} · 三个月起点 {preview.sourceCalendar.cycleAnchor}</p>}
      {preview.warnings.map(warning => <p className="field-note" key={warning}>{warning}</p>)}
      {!preview.backup ? <>
        <p className="field-note">{preview.mode === 'reset' ? '新工作区将重新配置日历。主题和已有备份保留。' : '将完整替换本地工作区，使用源日历与历史。恢复后自动顺延暂停，确认后才继续。'}点击继续后暂停写入，直到最终确认或取消。</p>
        <Button disabled={working} onClick={() => void data({ type: 'prepare', generation, token: preview.token })}>创建保护备份并继续</Button>
      </> : <>
        <div className="backup-receipt"><strong>保护备份已创建并验证</strong><p>{preview.backupPath}</p><small>{preview.backup.size.toLocaleString()} 字节 · {preview.backup.createdAt}</small></div>
        <p>当前工作区已进入维护，仅可查看。取消会恢复原工作区的运行状态。</p>
        <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />我已了解旧数据只能从保护备份恢复</label>
        <p className="field-note">可在设置的备份列表选择这份保护副本，通过“恢复工作区”还原整库，不会与新数据合并。</p>
        <Button disabled={working || !acknowledged} onClick={() => void data({ type: 'commit', generation, token: preview.token, acknowledged: true })}>{preview.mode === 'reset' ? '重置并重新配置' : '确认恢复工作区'}</Button>
      </>}
      <Button variant="ghost" disabled={working} onClick={() => void data({ type: 'cancel', generation, token: preview.token })}>取消数据操作</Button>
    </section> : <>
      <section><h3>固定日历</h3>{calendar ? <><p className="field-note">{calendar.timezone} · 一周从星期{['一', '二', '三', '四', '五', '六', '日'][calendar.weekStart - 1]}开始 · 三个月起点 {calendar.cycleAnchor}</p><p className="field-note">日历已锁定。重新配置需先创建保护备份并重置。</p></> : <p className="field-note">首次配置尚未确认。</p>}</section>
      {calendar && <section className="relations-section"><h3>未完成事项处理</h3>
        {snapshot.policies.map(policy => <label key={policy.horizon}>{horizonNames[policy.horizon]}<select value={policy.mode} disabled={busy || working || policy.horizon === 'cycle'} onChange={event => void submit({ type: 'policy', horizon: policy.horizon, mode: event.target.value as 'auto' | 'manual', expectedVersion: policy.version })}><option value="manual">手动安排</option><option value="auto">自动顺延</option></select><small className="field-note">从 {policy.effectiveFromPeriodId.split(':').at(-1)} 起的来源周期生效；更早积压仍手动处理。</small></label>)}
      </section>}
      <section className="relations-section"><h3>备份</h3>
        <p className="field-note">{backups?.directory ?? '正在读取备份位置…'}</p>
        {backups?.lastError && <p role="alert">{backups.lastError}</p>}
        {calendar && <><label className="check-label"><input type="checkbox" checked={snapshot.workspace.backupEnabled} disabled={busy || working} onChange={event => void submit({ type: 'backupPreferences', enabled: event.target.checked, retention: snapshot.workspace.backupRetention })} />每天首次活跃时创建一致备份</label><label>保留日常备份份数<input type="number" min={1} max={100} value={retention} onChange={event => setRetention(Number(event.target.value))} /></label><Button variant="outline" disabled={busy || working || !Number.isInteger(retention) || retention < 1 || retention > 100} onClick={() => void submit({ type: 'backupPreferences', enabled: snapshot.workspace.backupEnabled, retention })}>保存备份设置</Button></>}
        <p className="field-note">只轮换日常副本，保护副本和手动备份保留。同盘备份不能防止整块磁盘损坏。</p>
        <Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'createBackup', generation })}>立即备份</Button>
        <div className="backup-list">{backups?.records.map(record => <div key={record.id}><p>{{ daily: '日常', protective: '保护', manual: '手动' }[record.kind]} · {record.createdAt.replace('T', ' ')}<small>{Math.ceil(record.size / 1024)} KB</small></p><Button variant="ghost" disabled={working || busy} onClick={() => void data({ type: 'previewBackup', generation, backupId: record.id })}>预览恢复</Button></div>)}</div>
      </section>
      <section className="relations-section"><h3>工作区数据</h3><p className="field-note">JSON 与 SQLite 恢复都会先校验和预览，再创建本机保护备份。不会合并工作区。</p><div className="detail-actions"><Button variant="outline" disabled={working || busy} onClick={() => void desktopApi().exportWorkspace().catch(() => setError('导出结果未确认，请重试'))}>导出完整 JSON</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'chooseImport', format: 'json', generation })}>从 JSON 恢复…</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'chooseImport', format: 'sqlite', generation })}>从 SQLite 备份恢复…</Button><Button variant="outline" disabled={working || busy} onClick={() => void data({ type: 'previewReset', generation })}>重置工作区…</Button></div></section>
      <section className="relations-section"><h3>自动顺延批次</h3>{!batches.length && <p className="field-note">还没有自动顺延。</p>}{batches.map(batch => <details className="batch-preview" key={batch.id}><summary>{batch.at.replace('T', ' ')} · {batch.total} 项 · 已撤销 {batch.undone} 项</summary><p className="field-note">只撤销仍匹配的位置效果；文本和当前完成状态保留。实际冲突会跳过并报告数量。</p><ul>{batch.items.map(item => <li key={item.id}>{item.title}<small>{item.from} → {item.to}</small></li>)}</ul><Button variant="outline" disabled={working || busy || batch.undone === batch.total} onClick={() => void submit({ type: 'undoBatch', originalOperationId: batch.id })}>确认撤销这个批次</Button></details>)}</section>
    </>}
  </Modal>
}
