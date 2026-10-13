/**
 * [INPUT]: A confirmed natural-year workspace observed on 2026-10-12 in Asia/Shanghai.
 * [OUTPUT]: The interaction mockup's example items. A normal launch does not call this.
 * [POS]: Demo seed for screenshots. Later items stay unlinked, matching the horizon rule.
 */
import type { Period } from './types'
import type { LocalWorkspace } from './store'

export const DEMO_NOW = '2026-10-12T01:00:00.000Z'

export function seedDemo(store: LocalWorkspace, at = DEMO_NOW): void {
  const year = (title: string, flowColor: number) => store.create(at, { title, horizon: 'year', flowColor }).id
  const marathon = year('跑完一场半程马拉松', 0)
  const goalloom = year('Goalloom 移动版上线', 1)
  const books = year('读完 24 本书', 2)
  const kyoto = year('带爸妈去一次京都', 3)
  const indie = year('独立开发副业', 4)
  const child = (title: string, horizon: 'half' | 'cycle' | 'month' | 'week' | 'day', parents: string[], extra?: { dueDate?: string; description?: string; periodId?: string }) => {
    const id = store.create(at, {
      title, horizon, dueDate: extra?.dueDate ?? null,
      ...(extra?.description ? { description: extra.description } : {}),
      ...(parents[0] ? { parentId: parents[0] } : {}),
      ...(extra?.periodId ? { periodId: extra.periodId } : {}),
    }).id
    for (const parentId of parents.slice(1)) store.link(at, parentId, id)
    return id
  }
  child('体重回到 68kg', 'half', [marathon])
  child('完成同步协议 P0–P3', 'half', [goalloom, indie])
  child('完成 21km 配速训练计划', 'cycle', [marathon])
  child('移动端交互原型评审', 'cycle', [goalloom, indie], { dueDate: '2026-10-20' })
  child('每周跑量 ≥ 30km', 'month', [marathon])
  child('端到端加密 spike 复测', 'month', [goalloom, indie])
  child('读完《设计心理学》', 'month', [books])
  child('订京都酒店', 'month', [kyoto], { dueDate: '2026-10-25', description: '优先岚山附近，带老人别选太远的' })
  child('周三 10km 节奏跑', 'week', [marathon])
  const design = child('写移动端 DESIGN.md', 'week', [goalloom, indie], { description: '- [ ] 信息架构\n- [x] 手势表\n对照桌面逐项核对' })
  store.create(at, { title: '信息架构', horizon: 'week', nestingParentId: design })
  const gestured = store.create(at, { title: '手势表', horizon: 'week', nestingParentId: design }).id
  store.setStatus(at, gestured, 'done')
  child('整理读书笔记', 'week', [books])
  const run = child('晨跑 6km', 'day', [marathon])
  store.setStatus(at, run, 'done')
  const review = child('评审看板手势冲突方案', 'day', [goalloom, indie], { dueDate: '2026-10-12', description: '- [ ] 对照 PRD 10.2\n- [ ] 录屏演示\n对照 PRD §10.2' })
  store.create(at, { title: '对照 PRD 10.2', horizon: 'day', nestingParentId: review })
  store.create(at, { title: '录屏演示', horizon: 'day', nestingParentId: review })
  child('回复房东邮件', 'day', [kyoto], { description: '问下月底能否续租' })
  child('Supabase 区域选型', 'day', [goalloom], { dueDate: '2026-10-11' })
  child('读 30 页', 'day', [books])
  for (const title of ['学一点日语', '换一把人体工学椅', '试试 Expo Router v4', '给博客加 RSS']) store.create(at, { title, horizon: 'later' })
  store.setPolicy('day', 'manual')
  const snap = store.load(at)
  const today = snap.periods.day
  if (!today || !snap.calendar) return
  const past: Period = { id: `${snap.calendar.id}:day:2026-10-11`, horizon: 'day', startDate: '2026-10-11', endDate: '2026-10-12', startAt: '2026-10-10T16:00:00Z', endAt: today.startAt }
  store.savePeriod(past)
  child('续签健身房会员', 'day', [], { dueDate: '2026-10-11', periodId: past.id })
  child('整理 9 月报销', 'day', [], { dueDate: '2026-10-11', periodId: past.id })
  child('读 30 页', 'day', [books], { dueDate: '2026-10-10', periodId: past.id })
}
