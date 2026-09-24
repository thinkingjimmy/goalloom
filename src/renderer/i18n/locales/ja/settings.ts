/**
 * [INPUT]: 依赖 ../zh/settings 的 SettingsCatalog 类型；分类标识与界面参数。
 * [OUTPUT]: 日语的设置弹窗分册：分类分组与名称、每类页头说明、外观/日历/备份与恢复/条目文案。
 * [POS]: renderer/i18n/locales/ja 的设置分册，与 zh 同构；通用文案仍在 messages.ts。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { SettingsCatalog } from '../zh/settings'

export const settingsMessages: SettingsCatalog = {
  preferences: '環境設定',
  workspace: 'ワークスペース',
  items: '項目',
  backupSection: 'バックアップと復元',
  openAnytime: 'いつでも設定を開く',
  enabledMeta: '有効',
  subtitles: {
    appearance: 'このデバイスの表示にのみ影響し、ワークスペースの履歴には書き込みません',
    smart: 'Jev が一文を編集できる行動プレビューに整理します。確認するまで書き込まれません',
    calendar: 'カレンダーは初回の確定後に固定されます。期限を過ぎた未完了の項目の扱いは列ごとに決まります',
    backup: 'バックアップはこのコンピュータに保存されます。復元はデータ全体を置き換え、統合しません',
    trash: '復元すると元の状態と配置に戻り、削除時に外れたリンクの復元も試みます',
  },
  // Appearance
  styleNotes: { paper: '温かみのある紙面、点線の区切り、やわらかな影', minimal: 'ニュートラルなグレー、細い実線の枠' },
  checkNotes: { outline: 'フローの色の枠線だけで、最も控えめ', paper: '白地でフローの色を引き立てる', tint: '同系色の淡い地で、グループが最も分かりやすい' },
  relationLines: '関係線',
  relationLinesNote: 'フローを 1 つに絞り込むと、上位と下位を線でつなぎます',
  // Smart input
  smartEnabledNote: '全体の＋で考えを書き、入力を止めると自動で整理します',
  privacy: 'プライバシー',
  privacyPoints: [
    '送信するのは、現在の入力の原文、ワークスペースの日付、名前を挙げたか選択した目標のタイトル・状態・配置のみです',
    'メモ、履歴、ゴミ箱は送信せず、ワークスペース全体をアップロードすることもありません',
    'Key はこの PC に暗号化して保存され、ワークスペースのデータ、バックアップ、書き出しには含まれません',
  ],
  // Calendar
  lockedNote: '固定済み · 設定し直すには保護バックアップを作成してワークスペースをリセットしてください',
  nextCycle: (date: string) => `次の期間 ${date}`,
  overdue: '期限切れの未完了',
  policyNotes: {
    month: { auto: '月末に自動で翌月へ移動', manual: '月末に過去の期間に残し、整理を待つ' },
    week: { auto: '週の終わりに自動で翌週へ移動', manual: '週の終わりに過去の期間に残し、整理を待つ' },
    day: { auto: '0 時に自動で新しい今日へ移動', manual: '0 時に過去の期間に残し、整理を待つ' },
  },
  undoRollover: 'この繰り越しを取り消す',
  // Backup & restore
  backedUpAt: (when: string) => `${when} にバックアップ済み`,
  backupSummary: (count: number) => `計 ${count} 件 · ワークスペースと同じディスクにあるため、ディスク全体の故障は防げません`,
  dailyBackup: '毎日の自動バックアップ',
  dailyBackupNote: '毎日最初に開いたときに作成',
  keepLatest: '保持する数',
  keepCount: (count: number) => `${count} 件`,
  backupList: 'バックアップ一覧',
  restoreFrom: 'これで復元',
  showAll: (count: number) => `${count} 件をすべて表示`,
  showFewer: '折りたたむ',
  transfer: '読み込みと書き出し',
  exportJson: '完全な JSON を書き出す',
  exportNote: '項目、リンク、期間、すべての履歴',
  exportAction: '書き出す',
  restoreFile: 'ファイルから復元',
  restoreFileNote: 'JSON または .sqlite に対応。置き換え前にプレビューし、現在のデータを自動でバックアップします',
  chooseFile: 'ファイルを選択',
  resetNote: '項目を消去してカレンダーを設定し直します。テーマと既存のバックアップは保持されます',
  reset: 'リセット',
  today: '今日',
  yesterday: '昨日',
  // Items
  trashNote: 'ゴミ箱は自動で空になりません。削除した項目は復元するまでここに残ります。',
}
