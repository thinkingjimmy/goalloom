/**
 * [INPUT]: Locale-aware dates, mode and period presentation parameters.
 * [OUTPUT]: Complete calendar-mode, annual-direction and anchored-period UI copy.
 * [POS]: Calendar catalog shared by setup, board, details and settings.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { widen } from '../../../../shared/i18n/locale'

export const calendarMessages = widen({
  year: "1年",
  half: "半年",
  naturalYear: "今年",
  previousQuarter: "上季度",
  nextQuarter: "下季度",
  naturalCycle: "本季度",
  previousYear: "上一年",
  nextYear: "下一年",
  previousNaturalYear: "去年",
  nextNaturalYear: "明年",
  previousHalf: "上个半年",
  nextHalf: "下个半年",
  returnCurrent: "回到当期",
  returnNaturalYear: "回到今年",
  returnNaturalCycle: "回到本季度",
  chooseCalendar: "选择你的日历",
  rollingMode: "365 天",
  naturalMode: "自然年",
  rollingDescription: "从起点日起，每 12 个月为一年",
  naturalDescription: "按 1 月 1 日起的日历年安排",
  changeAnchor: "更改起点",
  anchorLabel: "起点",
  modify: "修改",
  manualAlways: "始终手动安排",
  nextYearStart: "下一年度开始",
  nextHalfStart: "下个半年开始",
  calendarMode: "日历模式",
  dateChanged: "日期已变化，请确认新的起点",
  periodRecordsFailed: "周期记录读取失败，请重试",
  naturalDirectionTitle: "今年，你最想推进哪件事？",
  useCurrentYear: "改回今年",
  example1: "跑完一场全程马拉松",
  example2: "读完 24 本书",
  example3: "换到理想的工作",
  modeRange: (year: string, half: string, cycle: string) => `1年到 ${year} · 半年到 ${half} · 3个月到 ${cycle}`,
  naturalRange: (days: number, end: string) => `今年还剩 ${days} 天 · 本季度到 ${end}`,
  yearRemaining: (days: number) => `这一年还剩 ${days} 天`,
  futureDirection: (days: number, year: string) => `当期只剩 ${days} 天，方向会放进 ${year}`,
  lockedSummary: (mode: string, date: string, zone: string, weekday: string) => `将锁定：${mode} · 起点 ${date} · ${zone} · ${weekday}开始`,
  halfRange: (first: string, last: string, year: string | null) => `${year ? year + '年' : ''}${first}月–${last}月`,
})
