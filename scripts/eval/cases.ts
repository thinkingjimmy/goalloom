/**
 * [INPUT]: Chinese inputs, labelled outcomes and optional per-case calendar observations.
 * [OUTPUT]: evalCases: labelled inputs, optional existing goals and the preview each one should produce.
 * [POS]: Ground truth for scripts/eval/smart.ts; expectations describe product intent, not current model output.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { PeriodHorizon } from '../../src/shared/contracts/values'
import type { ItemHorizon } from '../../src/shared/contracts/entities'

export interface Expected {
  drafts: number | [number, number]
  titles?: string[]
  horizons?: ItemHorizon[]
  inferredHorizon?: { value: ItemHorizon | null; certain: boolean }[]
  due?: (string | null)[]
  // Some prefilled deadline equals this date, whichever draft carries it.
  anyDue?: string
  descriptionIncludes?: string[]
  existingParent?: string
  // Judged yes or maybe: shown to the user as a parent or a one-click suggestion.
  parentSuggested?: string
  draftParent?: [child: number, parent: number][]
  warnings?: string[]
}
export interface Goal { title: string; horizon: PeriodHorizon }
export interface EvalCalendar { mode: 'rolling' | 'natural'; anchor: string; today: string; timezone: string; weekStart: number }
export interface EvalCase { id: string; text: string; goals?: (string | Goal)[]; calendar?: EvalCalendar; expected: Expected }

export const evalCases: EvalCase[] = [
  { id: 'website-with-feature', text: '搞个个人网站（放一些碎碎念，学习笔记等），然后里面有个判断排行榜，专门用于记录自己的各类判断。',
    expected: { drafts: 1, titles: ['搞个个人网站（放一些碎碎念，学习笔记等）'], descriptionIncludes: ['然后里面有个判断排行榜，专门用于记录自己的各类判断。'], horizons: ['later'] } },
  { id: 'single-today', text: '今天写周报', expected: { drafts: 1, horizons: ['day'], due: [null] } },
  { id: 'deadline-modifier', text: '整理反馈，周五前完成', expected: { drafts: 1, titles: ['整理反馈'], due: ['2026-09-25'], horizons: ['later'] } },
  { id: 'three-horizons', text: '本月发布内测版；本周完成登录功能；今天写文案', expected: { drafts: 3, horizons: ['month', 'week', 'day'] } },
  { id: 'plain-list', text: '买牛奶\n取快递\n给妈妈打电话', expected: { drafts: 3, horizons: ['later', 'later', 'later'] } },
  { id: 'named-parent', text: '今天优化登录页，周五前完成，关联「官网改版」', goals: ['官网改版', '健身计划'],
    expected: { drafts: 1, titles: ['今天优化登录页'], horizons: ['day'], due: ['2026-09-25'], existingParent: '官网改版' } },
  { id: 'future-week', text: '下周三跟设计开会', expected: { drafts: 1, horizons: ['later'], warnings: ['future'] } },
  { id: 'repeat', text: '每天早上跑步', expected: { drafts: 1, warnings: ['repeat'] } },
  { id: 'reminder-clock', text: '明天下午三点提醒我交房租', expected: { drafts: 1, warnings: ['reminder'] } },
  { id: 'goal-with-steps', text: '准备上线内测\n- 写测试用例\n- 修复登录 bug', expected: { drafts: 3, draftParent: [[1, 0], [2, 0]] } },
  { id: 'negated-today', text: '整理相册，不用今天做，以后再说', expected: { drafts: 1, horizons: ['later'] } },
  { id: 'absolute-deadline', text: '10月8日前交季度报告', expected: { drafts: 1, due: ['2026-10-08'] } },
  { id: 'note-comma', text: '读《原则》，重点看第二部分，边读边做笔记', expected: { drafts: [1, 2] } },
  // --- Held-out styles added after the first tuning pass, to catch overfitting. ---
  { id: 'errands-comma', text: '周末去超市买菜，顺便给车加油', expected: { drafts: [1, 2] } },
  { id: 'goal-in-clause', text: '开始学吉他，目标是年底能弹一首完整的歌', expected: { drafts: 1, descriptionIncludes: ['年底能弹一首完整的歌'] } },
  { id: 'article-includes', text: '写一篇关于 AI 产品设计的文章，包括选题、提纲和初稿', expected: { drafts: 1, descriptionIncludes: ['包括选题、提纲和初稿'] } },
  { id: 'mixed-three', text: '给团队发周报；约小王下周聊晋升；本周五前提交报销', expected: { drafts: 3, due: [null, null, '2026-09-25'], warnings: ['future'] } },
  { id: 'numbered-plan', text: '装修新家\n1. 选设计师\n2. 定预算\n3. 看材料', expected: { drafts: 4, draftParent: [[1, 0], [2, 0], [3, 0]] } },
  { id: 'this-month', text: '这个月读完两本书', expected: { drafts: 1, horizons: ['month'] } },
  { id: 'tomorrow', text: '明天记得带伞', expected: { drafts: 1, horizons: ['later'], warnings: ['future'] } },
  { id: 'repeat-detail', text: '学英语，每周三次，每次半小时', expected: { drafts: 1, warnings: ['repeat'] } },
  { id: 'bare', text: '整理桌面', expected: { drafts: 1, horizons: ['later'], due: [null] } },
  { id: 'named-deadline', text: '9月30日前完成季度复盘，关联「年度 OKR」', goals: ['年度 OKR', '健康'], expected: { drafts: 1, due: ['2026-09-30'], existingParent: '年度 OKR' } },
  { id: 'product-feature', text: '做一个 Chrome 插件，能一键保存网页到 Notion，还要支持标签', expected: { drafts: 1, descriptionIncludes: ['支持标签'] } },
  // Screenshot 2026-09-25: the goal shares only the project name; it must reach Jev and be offered as a parent.
  { id: 'project-keyword-goal', text: 'Bottega 远端控制功能完成验收（Web 控制 PC）',
    goals: [{ title: '副业收入提升到 $5k', horizon: 'cycle' }, { title: 'Bottega 正式对外，同时开启商业化', horizon: 'month' }, { title: '健身计划', horizon: 'month' }],
    expected: { drafts: 1, titles: ['Bottega 远端控制功能完成验收（Web 控制 PC）'], parentSuggested: 'Bottega 正式对外，同时开启商业化' } },
  // --- Realistic TODOs against a simulated board (2026-09-25), incl. goals that must reach Jev by project name. ---
  ...realistic(),
  ...calendarCases(),
  { id: 'this-week-with-reason', text: '本周把简历更新一下，因为下个月要开始找工作', expected: { drafts: 1, horizons: ['week'], descriptionIncludes: ['下个月要开始找工作'] } },
]

function realistic(): EvalCase[] {
  const board: Goal[] = [
    { title: '副业收入提升到 $5k', horizon: 'cycle' }, { title: '身体健康：体脂降到 18%', horizon: 'cycle' },
    { title: 'Bottega 正式对外，同时开启商业化', horizon: 'month' }, { title: 'Goalloom 私测版发布', horizon: 'month' },
    { title: '完成 Q3 用户访谈报告', horizon: 'week' },
  ]
  const bottega = 'Bottega 正式对外，同时开启商业化', goalloom = 'Goalloom 私测版发布'
  const cases: [string, string, Expected][] = [
    ['r-goalloom-feature', 'Goalloom 加一个导出 Markdown 的功能', { drafts: 1, horizons: ['later'], parentSuggested: goalloom }],
    ['r-bottega-pricing', '给 Bottega 写一份定价方案，周五前发给合伙人', { drafts: [1, 2], titles: ['给 Bottega 写一份定价方案'], anyDue: '2026-09-25', parentSuggested: bottega }],
    ['r-bottega-trademark', '给 Bottega 申请一个商标', { drafts: 1, parentSuggested: bottega }],
    ['r-goalloom-parens', '搞定 Goalloom 打包签名的问题（证书过期了）', { drafts: 1, titles: ['搞定 Goalloom 打包签名的问题（证书过期了）'], parentSuggested: goalloom }],
    ['r-goalloom-copy', '把 Goalloom 的设置页面文案再过一遍，顺便检查英文翻译', { drafts: [1, 2], parentSuggested: goalloom }],
    ['r-interviews-week', '这周约 5 个用户做访谈', { drafts: 1, horizons: ['week'] }],
    ['r-errands', '订下周去上海的机票；整理报销单据；给房东转房租', { drafts: 3 }],
    ['r-bare-word', '周报', { drafts: 1, horizons: ['later'], due: [null] }],
    ['r-two-today', '今天：回复邮件\n今天：改 PPT', { drafts: 2, horizons: ['day', 'day'] }],
    ['r-learning', '学习 TypeScript 泛型，看完官方文档那一章', { drafts: [1, 2] }],
    ['r-checkup', '11月1日之前完成年度体检', { drafts: 1, due: ['2026-11-01'] }],
    ['r-meeting-clock', '本周五下午两点和设计师开会', { drafts: 1, due: [null], warnings: ['clock_time'] }],
    ['r-shopping', '买菜：鸡蛋、牛奶、西红柿', { drafts: 1, titles: ['买菜：鸡蛋、牛奶、西红柿'] }],
    ['r-side-heading', '副业：\n- 做一个 Notion 模板上架\n- 写两篇小红书', { drafts: 3, draftParent: [[1, 0], [2, 0]] }],
    ['r-call-parents', '别忘了给爸妈打电话', { drafts: 1, horizons: ['later'] }],
    ['r-must-today', '今天必须把合同签了', { drafts: 1, horizons: ['day'] }],
    ['r-next-month', '下个月开始健身', { drafts: 1, horizons: ['later'], warnings: ['future'] }],
    ['r-book-comma', '阅读《思考，快与慢》', { drafts: 1, titles: ['阅读《思考，快与慢》'] }],
    ['r-bug', '修复 bug #123：登录后白屏', { drafts: 1, titles: ['修复 bug #123：登录后白屏'] }],
    ['r-interview-prep', '准备面试：复习算法，整理项目经历，模拟面试两次', { drafts: [1, 4] }],
    ['r-weekly-repeat', '每周一早上发周报', { drafts: 1, warnings: ['repeat'] }],
    ['r-closet', '整理衣柜，把不穿的捐掉', { drafts: [1, 2] }],
    ['r-month-report', '月底前把 Q3 用户访谈报告写完', { drafts: 1, due: ['2026-09-30'] }],
    ['r-mixed-newline', '今天去银行办卡\n本周把 Bottega 官网上线\n以后有空学做饭', { drafts: 3, horizons: ['day', 'week', 'later'], parentSuggested: bottega }],
  ]
  return cases.map(([id, text, expected]) => ({ id, text, goals: board, expected }))
}

function calendarCases(): EvalCase[] {
  const natural = (today: string): EvalCalendar => ({ mode: 'natural', anchor: '2026-01-01', today, timezone: 'Asia/Shanghai', weekStart: 1 })
  const rolling = (anchor: string): EvalCalendar => ({ mode: 'rolling', anchor, today: '2026-10-02', timezone: 'America/New_York', weekStart: 7 })
  return [
    { id: 'annual-explicit', text: '这一年完成职业转型', expected: { drafts: 1, horizons: ['year'] } },
    { id: 'half-explicit', text: '这半年跑完第一场马拉松', expected: { drafts: 1, horizons: ['half'] } },
    { id: 'natural-half-october', text: '下半年完成职业转型', calendar: natural('2026-10-02'), expected: { drafts: 1, horizons: ['half'] } },
    { id: 'natural-half-march', text: '下半年完成职业转型', calendar: natural('2026-03-02'), expected: { drafts: 1, horizons: ['later'], warnings: ['future'] } },
    { id: 'rolling-half-contained', text: '下半年完成职业转型', calendar: rolling('2026-07-01'), expected: { drafts: 1, horizons: ['half'] } },
    { id: 'rolling-half-crossing', text: '下半年完成职业转型', calendar: rolling('2026-06-01'), expected: { drafts: 1, horizons: ['year'] } },
    { id: 'next-half-future', text: '下个半年完成职业转型', calendar: natural('2026-10-02'), expected: { drafts: 1, horizons: ['later'], warnings: ['future'] } },
    { id: 'next-year-future', text: '明年跑完第一场马拉松', expected: { drafts: 1, horizons: ['later'], warnings: ['future'] } },
    { id: 'annual-inference', text: '实现职业转型，从零学习并进入理想行业', expected: { drafts: 1, horizons: ['later'], inferredHorizon: [{ value: 'year', certain: true }] } },
    { id: 'half-inference', text: '为「职业转型」完成技能学习与作品集阶段', goals: [{ title: '职业转型', horizon: 'year' }], expected: { drafts: 1, horizons: ['later'], inferredHorizon: [{ value: 'half', certain: false }] } },
    { id: 'annual-parent', text: '这半年完成作品集，关联「职业转型」', goals: [{ title: '职业转型', horizon: 'year' }], expected: { drafts: 1, horizons: ['half'], existingParent: '职业转型' } },
    { id: 'half-parent', text: '这三个月完成长跑基础训练，关联「首场马拉松」', goals: [{ title: '首场马拉松', horizon: 'half' }], expected: { drafts: 1, horizons: ['cycle'], existingParent: '首场马拉松' } },
  ]
}
