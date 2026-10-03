/**
 * [INPUT]: Locale-aware dates, mode and period presentation parameters.
 * [OUTPUT]: Complete calendar-mode, annual-direction and anchored-period UI copy.
 * [POS]: Calendar catalog shared by setup, board, details and settings.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { calendarMessages as source } from '../zh/calendar'

export const calendarMessages: typeof source = {
  year: "1年",
  half: "半年",
  naturalYear: "今年",
  previousQuarter: "前四半期",
  nextQuarter: "次四半期",
  naturalCycle: "今四半期",
  previousYear: "前の1年",
  nextYear: "次の1年",
  previousNaturalYear: "昨年",
  nextNaturalYear: "来年",
  previousHalf: "前の半年",
  nextHalf: "次の半年",
  returnCurrent: "今期に戻る",
  returnNaturalYear: "今年に戻る",
  returnNaturalCycle: "今四半期に戻る",
  chooseCalendar: "カレンダーを選ぶ",
  rollingMode: "365日",
  naturalMode: "暦年",
  rollingDescription: "開始日から12か月を1年とします",
  naturalDescription: "1月1日からの暦年で計画します",
  changeAnchor: "開始日を変更",
  anchorLabel: "開始日",
  modify: "変更",
  manualAlways: "常に手動で配置",
  nextYearStart: "次の1年の開始日",
  nextHalfStart: "次の半年の開始日",
  calendarMode: "カレンダーモード",
  dateChanged: "日付が変わりました。新しい開始日を確認してください。",
  periodRecordsFailed: "期間の記録を読み込めません。再試行してください。",
  naturalDirectionTitle: "今年、最も進めたいことは何ですか？",
  useCurrentYear: "今年に戻す",
  example1: "フルマラソンを完走する",
  example2: "本を24冊読む",
  example3: "理想の仕事を見つける",
  modeRange: (year: string, half: string, cycle: string) => `1年は${year}まで · 半年は${half}まで · 3か月は${cycle}まで`,
  naturalRange: (days: number, end: string) => `今年は残り${days}日 · 今四半期は${end}まで`,
  yearRemaining: (days: number) => `この1年は残り${days}日`,
  futureDirection: (days: number, year: string) => `残り${days}日です。方向は${year}に配置します。`,
  lockedSummary: (mode: string, date: string, zone: string, weekday: string) => `確定：${mode} · 開始${date} · ${zone} · ${weekday}始まり`,
  halfRange: (first: string, last: string, year: string | null) => `${year ? year + '年' : ''}${first}月–${last}月`,
}
