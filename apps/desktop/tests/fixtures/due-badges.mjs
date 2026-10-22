/**
 * [INPUT]: Isolated native Electron page, production IPC, workspace today and an evidence directory.
 * [OUTPUT]: Locale/theme/narrow-column capsule screenshots and repeatable geometry/data-integrity evidence.
 * [POS]: Deadline acceptance fixture; synthetic tasks use real storage, rendering never changes their data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

// Failure cases: overdue dates disappear, host time changes urgency, translated capsules overlap
// long titles, completed/undated rows retain a capsule, or inspecting deadlines changes task data.
export async function verifyDueBadges(application, page, today, out) {
  const labels = { zh: ['明天', '逾期'], en: ['Tomorrow', 'Overdue'], ja: ['明日', '期限切れ'], es: ['Mañana', 'Vencido'], fr: ['Demain', 'En retard'] }
  const tags = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP', es: 'es-ES', fr: 'fr-FR' }
  const seeded = await page.evaluate(async today => {
    const shift = n => { const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10) }
    const { workspace } = await window.goalloom.getSnapshot()
    const samples = [
      ['normal', '使用 Bottega 创建一个记录专用项目，并记录每日三餐和体重数据', shift(4)],
      ['tomorrow', 'Prepare the weekly plan and review the next steps', shift(1)],
      ['overdue', 'Review the draft and send the final design', shift(-1)],
      ['today', 'Write down the next action', today],
      ['none', 'Collect ideas without a deadline', null],
      ['done', 'Completed deadline sample', shift(-1)],
    ]
    const result = {}
    for (const [state, title, dueDate] of samples) {
      const reply = await window.goalloom.execute({ type: 'create', title, horizon: 'week', dueDate, generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
      const id = reply.result.itemId
      if (state === 'done') {
        const { item } = await window.goalloom.getItem(id)
        const status = await window.goalloom.execute({ type: 'status', itemId: id, expectedVersion: item.version, status: 'done', generation: workspace.generation, operationId: crypto.randomUUID() })
        if (!status.ok) throw Error(status.message)
      }
      result[state] = { id, date: dueDate }
    }
    return result
  }, today)
  const before = (await page.evaluate(() => window.goalloom.getSnapshot())).items
  const cases = []
  for (const locale of Object.keys(labels)) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload()
    const appearances = locale === 'zh' ? [['paper', 'light'], ['paper', 'dark'], ['minimal', 'light'], ['minimal', 'dark']] : [['paper', 'light']]
    for (const [style, theme] of appearances) {
      await page.evaluate(async ([style, theme]) => {
        const { workspace } = await window.goalloom.getSnapshot()
        const reply = await window.goalloom.execute({ type: 'preferences', style, theme, generation: workspace.generation, operationId: crypto.randomUUID() })
        if (!reply.ok) throw Error(reply.message)
      }, [style, theme])
      await page.waitForFunction(([style, theme]) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, [style, theme])
      for (const width of [1280, 720]) {
        await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 840), width)
        await page.waitForFunction(width => innerWidth === width, width)
        const column = page.locator('.board-column[data-horizon="week"]')
        await column.scrollIntoViewIfNeeded()
        const geometry = {}
        for (const [state, { id, date }] of Object.entries(seeded)) {
          const row = page.locator(`#item-${id}`), badge = row.locator('.due-badge')
          await row.waitFor({ state: 'attached' })
          if (['none', 'done'].includes(state)) { assert.equal(await badge.count(), 0); continue }
          assert.equal(await badge.getAttribute('datetime'), date)
          assert.equal(await badge.getAttribute('data-state'), ['tomorrow', 'overdue'].includes(state) ? state : 'normal')
          const formatted = new Intl.DateTimeFormat(tags[locale], { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
          const prefix = state === 'tomorrow' ? `${labels[locale][0]} · ` : state === 'overdue' ? `${labels[locale][1]} · ` : ''
          assert.equal(await badge.innerText(), `${prefix}${formatted}`)
          assert((await badge.getAttribute('aria-label')).includes(date.slice(0, 4)), 'The accessible name includes the year')
          assert.equal(await badge.locator('svg').count(), 1)
          geometry[state] = await badge.evaluate(node => {
            const rect = node.getBoundingClientRect(), line = node.closest('.task-line'), title = line.querySelector('.task-title')
            return { badge: rect.toJSON(), title: title.getBoundingClientRect().toJSON(), line: line.getBoundingClientRect().toJSON(), overflow: line.scrollWidth - line.clientWidth, color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }
          })
          const bounds = geometry[state]
          assert(bounds.badge.left >= bounds.title.right + 7 && bounds.badge.right <= bounds.line.right + 1, `${locale}/${width}/${state}: date and title do not overlap`)
          assert(bounds.badge.top >= bounds.title.top && bounds.badge.bottom <= bounds.title.top + 29, 'The capsule stays on the first title line')
          assert(bounds.overflow <= 1, 'The row has no horizontal overflow')
        }
        const screenshot = `${out}/badges-${locale}-${style}-${theme}-${width}.png`
        await column.screenshot({ path: screenshot })
        cases.push({ locale, style, theme, width, geometry, screenshot })
      }
    }
  }
  assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, before, 'Viewing dates never changes task data')
  console.log(`✓ Calendar capsules: normal/today/tomorrow/overdue/none/done; ${cases.length} locale/theme/width cases; unchanged task data`)
  return { passed: true, today, seeded, cases }
}
