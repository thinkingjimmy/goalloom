/**
 * [INPUT]: Settings categories, display preferences and interpolation parameters.
 * [OUTPUT]: Source settings catalog, including per-column completion-confetti and reduced-motion copy.
 * [POS]: Chinese settings copy and shared SettingsCatalog shape; common actions remain in messages.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { widen } from '../../../../shared/i18n/locale'
export const settingsMessages = widen({
  preferences: '偏好',
  workspace: '工作区',
  items: '条目',
  backupSection: '备份与恢复',
  openAnytime: '随时打开设置',
  enabledMeta: '已启用',
  subtitles: {
    appearance: '只影响这台设备的显示，不写入工作区历史',
    smart: 'Jev 把一句话整理成可编辑的行动预览，你确认后才会写入',
    calendar: '日历在首次确认后锁定；各列决定到期未完成的事项怎么处理',
    backup: '备份存在这台电脑上；恢复会整库替换，不合并',
    trash: '还原回到原状态和位置，并尝试找回删除时断开的关联',
  },
  // Appearance
  styleNotes: { paper: '暖色纸面，虚线分隔，柔和投影', minimal: '中性灰阶，实线细描边' },
  checkNotes: { outline: '只留流程色描边，最安静', paper: '白底衬出流程色', tint: '同色淡底，分组最明显' },
  relationLines: '关系线',
  relationLinesNote: '筛选单个流程时，用线连起它的上下级',
  celebration: '完成撒花',
  celebrationNote: '完成条目时从左右下角撒花，只在选中的列播放。',
  celebrationOff: '已关闭。选中任一列即可开启。',
  celebrationColumns: '在这些列完成时撒花',
  celebrationTry: '试一下',
  celebrationReducedMotion: '系统已开启「减少动态效果」，撒花暂不播放。',
  // Smart input
  smartEnabledNote: '全局＋写下想法，停下输入后自动整理',
  privacy: '隐私',
  privacyPoints: [
    '只发送当前输入的原文、工作区日期，以及你点名或选中的目标的标题、状态和位置',
    '不发送说明、历史、回收站，也不会上传整个工作区',
    'Key 加密保存在本机，不进入工作区数据、备份或导出',
  ],
  // Calendar
  lockedNote: '已锁定 · 重新配置需先创建保护备份并重置工作区',
  nextCycle: (date: string) => `下一周期 ${date}`,
  overdue: '到期未完成',
  policyNotes: {
    month: { auto: '月底自动移入下月', manual: '月底留在往期，等你安排' },
    week: { auto: '周末结束后自动移入下周', manual: '周末留在往期，等你安排' },
    day: { auto: '零点自动移到新的今天', manual: '零点留在往期，等你安排' },
  },
  undoRollover: '撤销这次顺延',
  // Backup & restore
  backedUpAt: (when: string) => `${when} 已备份`,
  backupSummary: (count: number) => `共 ${count} 份 · 与工作区在同一块磁盘，无法防止整块磁盘损坏`,
  dailyBackup: '每日自动备份',
  dailyBackupNote: '每天首次打开时创建',
  keepLatest: '保留最近',
  keepCount: (count: number) => `${count} 份`,
  backupList: '备份列表',
  restoreFrom: '用它恢复',
  showAll: (count: number) => `显示全部 ${count} 份`,
  showFewer: '收起',
  transfer: '导入导出',
  exportJson: '导出完整 JSON',
  exportNote: '条目、关联、周期与全部历史',
  exportAction: '导出',
  restoreFile: '从文件恢复',
  restoreFileNote: '支持 JSON 或 .sqlite，替换前会先预览并自动备份当前数据',
  chooseFile: '选择文件',
  resetNote: '清空条目并重新配置日历；主题和已有备份保留',
  reset: '重置',
  today: '今天',
  yesterday: '昨天',
  // Items
  trashNote: '回收站不会自动清空；删除的条目会一直留在这里，直到你还原。',
})
export type SettingsCatalog = typeof settingsMessages
