/**
 * [INPUT]: 工作区代次、禁用状态、导出回调与数据动作。
 * [OUTPUT]: 导出完整 JSON、从 JSON/SQLite 恢复入口、独立危险区的重置入口。
 * [POS]: settings 的导入导出分类；所有整库替换都进入 TransferReview 的两阶段确认。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { DataAction } from '../../../../shared/contracts/transfer'
import { messages } from '../../../i18n/messages'
import { SettingsGroup, SettingsRow } from './parts'

export function DataPane({ generation, disabled, exportJson, data }: { generation: string; disabled: boolean; exportJson: () => void; data: (action: DataAction) => Promise<void> }) {
  return <>
    <SettingsGroup title={messages.exportSection}>
      <SettingsRow title={messages.fullJson} note={messages.fullJsonNote}>
        <button type="button" className="settings-button" disabled={disabled} onClick={exportJson}>{messages.exportAction}</button>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={messages.restoreWorkspace} footnote={messages.restoreFootnote}>
      <SettingsRow title={messages.fromJson} note={messages.fromJsonNote}>
        <button type="button" className="settings-button" disabled={disabled} onClick={() => void data({ type: 'chooseImport', format: 'json', generation })}>{messages.chooseJson}</button>
      </SettingsRow>
      <SettingsRow title={messages.fromSqlite} note={messages.fromSqliteNote}>
        <button type="button" className="settings-button" disabled={disabled} onClick={() => void data({ type: 'chooseImport', format: 'sqlite', generation })}>{messages.chooseSqlite}</button>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={messages.dangerZone} danger>
      <SettingsRow title={messages.resetWorkspace} note={messages.resetRowNote}>
        <button type="button" className="settings-button danger" disabled={disabled} onClick={() => void data({ type: 'previewReset', generation })}>{messages.resetShort}</button>
      </SettingsRow>
    </SettingsGroup>
  </>
}
