/**
 * [INPUT]: Static website, Chromium and owning website E2E helpers.
 * [OUTPUT]: Split-FAQ layout, full-column answers, native disclosure, support, mobile, no-JS and pricing Free-plan download evidence.
 * [POS]: Homepage FAQ acceptance; verifies shared trial/refund policies, security copy, inline support and downloads.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const QUESTIONS = {
  en: ['Which features are free to use?', 'Is there a free trial?', 'Is my data safe? Can you see my data?', 'Do you offer refunds?', 'Still have a question?'],
  'zh-CN': ['哪些功能免费使用？', '支持试用吗？', '我的数据安全吗？你们能看到我的数据吗？', '是否支持退款？', '还有其他疑问？'],
  ja: ['無料で使える機能は？', '無料で試せますか？', 'データは安全ですか？運営者は私のデータを見られますか？', '返金には対応していますか？', 'ほかにご質問はありますか？'],
  es: ['¿Qué funciones se pueden usar gratis?', '¿Hay una prueba gratuita?', '¿Están seguros mis datos? ¿Podéis verlos?', '¿Ofrecéis reembolsos?', '¿Tienes otra pregunta?'],
  fr: ['Quelles fonctionnalités sont gratuites ?', 'Proposez-vous un essai gratuit ?', 'Mes données sont-elles en sécurité ? Pouvez-vous les voir ?', 'Proposez-vous des remboursements ?', 'Une autre question ?'],
}

export async function runFaqCases({ browser, base, LOCALES, check, assert, artifact }) {
  const facts = []
  const errors = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  try {
    for (const [locale, prefix] of LOCALES) await check(`FAQ ${locale}: split columns, exclusive native questions and private/technical support`, async () => {
      await page.goto(base + prefix)
      const section = page.locator('#faq')
      await section.scrollIntoViewIfNeeded()
      const details = section.locator('details')
      const questions = await details.locator('summary').allTextContents()
      assert(JSON.stringify(questions) === JSON.stringify(QUESTIONS[locale]), `unexpected homepage questions: ${JSON.stringify({ locale, questions })}`)
      assert(await section.locator('.home-faq-help').count() === 0, 'standalone support area remains')
      assert(await section.evaluate(node => { const style = getComputedStyle(node); return style.paddingTop === '50px' && style.paddingBottom === '50px' }), 'homepage FAQ desktop padding was not halved')
      assert(!await details.last().locator('.home-faq-support').isVisible(), 'support must start collapsed')
      assert(await details.first().evaluate(node => node.open) && await section.locator('details[open]').count() === 1, 'first question must be the only default open item')
      const layout = await section.evaluate(node => {
        const heading = node.querySelector('.home-faq-heading').getBoundingClientRect()
        const questions = node.querySelector('.home-faq-list').getBoundingClientRect()
        const answer = node.querySelector('details[open] p').getBoundingClientRect()
        const list = node.querySelector('.home-faq-list')
        const borders = { top: getComputedStyle(list).borderTopWidth, bottom: getComputedStyle(list.lastElementChild).borderBottomWidth, between: [...list.children].slice(0, -1).map(item => getComputedStyle(item).borderBottomWidth) }
        return { borders, headingRight: heading.right, questionLeft: questions.left, questionWidth: questions.width, answerWidth: answer.width, topDelta: Math.abs(heading.top - questions.top) }
      })
      assert(layout.headingRight < layout.questionLeft && layout.topDelta <= 2, JSON.stringify(layout))
      assert(Math.abs(layout.answerWidth - layout.questionWidth) <= 2, `answer leaves unused column width: ${JSON.stringify(layout)}`)
      assert(layout.borders.top === '0px' && layout.borders.bottom === '0px' && layout.borders.between.every(value => value === '1px'), `FAQ outer borders remain or internal separators were removed: ${JSON.stringify(layout.borders)}`)
      await details.nth(1).locator('summary').click()
      assert(await details.nth(1).evaluate(node => node.open) && !await details.first().evaluate(node => node.open), 'opening another question did not close the first')
      await details.nth(1).locator('summary').press('Enter')
      assert(!await details.nth(1).evaluate(node => node.open), 'Enter did not close the question')
      await details.first().locator('summary').focus()
      await details.first().locator('summary').press('Space')
      assert(await details.first().evaluate(node => node.open), 'Space did not open the question')
      assert(await section.locator('a[href="mailto:hellojimmywong.ai@gmail.com"]').count() === 1, 'private support missing')
      assert(await section.locator('a[href="https://github.com/thinkingjimmy/goalloom/issues"]').count() === 1, 'technical support missing')
      const policyPage = await context.newPage()
      try {
        await policyPage.goto(`${base}${prefix}pricing/`)
        for (const id of ['free', 'trial', 'refunds']) {
          const homeAnswer = await section.locator(`#home-faq-${id} > p`).textContent()
          const policyAnswer = await policyPage.locator(`#service-${id}`).textContent()
          assert(homeAnswer.length > 20 && homeAnswer === policyAnswer, `${locale}: ${id} answer differs from the finalized pricing policy`)
        }
      } finally { await policyPage.close() }
      const trial = await section.locator('#home-faq-trial > p').textContent()
      assert(trial.includes('8') && trial.includes('192') && !trial.includes('{'), 'trial values are missing or unresolved')
      const security = await section.locator('#home-faq-security > p').textContent()
      assert(security.includes('SQLite') && /\b(?:AI|IA)\b/u.test(security) && security.includes('Goalloom'), 'security answer must cover local storage and AI processing separately')
      assert(await section.locator('.download-split, .dl-title').count() === 0, 'download promotion still replaces the FAQ heading')
      if (locale === 'zh-CN') await section.screenshot({ path: join(artifact, 'faq-split-zh-desktop.png') })
      await details.last().locator('summary').press('Enter')
      assert(await details.last().locator('p').isVisible() && !await details.first().evaluate(node => node.open), 'support did not open as an exclusive FAQ answer')
      for (const link of await details.last().locator('.home-faq-support a').all()) {
        assert(await link.isVisible() && await link.evaluate(node => node.parentElement.tagName === 'P' && getComputedStyle(node).display === 'inline'), 'support links must be inline in the answer paragraph')
      }
      assert(await details.last().locator('.home-faq-links, button').count() === 0 && await details.last().locator('p svg').count() === 0, 'support links still use a separate action row or icons')
      assert(!/[{}]/u.test(await details.last().locator('p').innerText()), 'support template tokens are visible')
      if (locale === 'zh-CN') await section.screenshot({ path: join(artifact, 'faq-support-zh-desktop.png') })
      if (locale === 'zh-CN') {
        await section.locator('#home-faq-security summary').click()
        await section.screenshot({ path: join(artifact, 'faq-security-zh-desktop.png') })
      }
      facts.push({ locale, layout, questions, answers: questions.length, exclusive: true, sharedPolicyAnswers: true, trial, security, supportInline: true })
    })
  } finally { await context.close() }

  await check('FAQ: all five languages stack on phones in both themes with touch-sized questions', async () => {
    const mobile = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    try {
      const page = await mobile.newPage()
      page.on('pageerror', error => errors.push(String(error)))
      for (const width of [320, 390]) for (const scheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: scheme })
        for (const [locale, prefix] of LOCALES) {
          await page.goto(base + prefix)
          const section = page.locator('#faq')
          await section.scrollIntoViewIfNeeded()
          const layout = await section.evaluate(node => ({
            headingBottom: node.querySelector('.home-faq-heading').getBoundingClientRect().bottom,
            listTop: node.querySelector('.home-faq-list').getBoundingClientRect().top,
            overflow: document.documentElement.scrollWidth - innerWidth,
            topBorder: getComputedStyle(node.querySelector('.home-faq-list')).borderTopWidth,
            bottomBorder: getComputedStyle(node.querySelector('.home-faq-list details:last-child')).borderBottomWidth,
          }))
          assert(layout.headingBottom <= layout.listTop && layout.overflow <= 0, JSON.stringify({ locale, width, scheme, layout }))
          assert(await section.evaluate(node => { const style = getComputedStyle(node); return style.paddingTop === '28px' && style.paddingBottom === '28px' }), 'homepage FAQ phone padding was not halved')
          assert(layout.topBorder === '0px' && layout.bottomBorder === '0px', 'FAQ outer borders remain on phones')
          const next = section.locator('details').nth(1)
          const target = await next.locator('summary').boundingBox()
          assert(target.height >= 44, 'FAQ touch target too small')
          await next.locator('summary').tap()
          assert(await next.locator('p').isVisible() && await section.locator('details[open]').count() === 1, 'touch disclosure failed')
          const support = section.locator('details').last()
          await support.locator('summary').tap()
          assert(await support.locator('.home-faq-support').isVisible() && !await next.locator('p').isVisible(), 'touch support disclosure failed')
          for (const link of await support.locator('a').all()) assert(await link.isVisible(), 'inline support link is unavailable on phones')
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'expanded support overflows on phones')
          if (width === 390 && locale === 'zh-CN' && scheme === 'dark') await section.screenshot({ path: join(artifact, 'faq-split-zh-phone-dark.png') })
        }
      }
    } finally { await mobile.close() }
  })

  await check('FAQ: all answers, single-item disclosure and support work without JavaScript', async () => {
    const plain = await browser.newContext({ javaScriptEnabled: false })
    try {
      const page = await plain.newPage()
      for (const width of [1440, 390]) for (const [, prefix] of LOCALES) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(base + prefix)
        const section = page.locator('#faq')
        const details = section.locator('details')
        assert(await details.count() === 5 && await details.first().locator('p').isVisible(), 'static FAQ missing')
        await details.last().locator('summary').click()
        assert(await details.last().locator('p').isVisible() && !await details.first().locator('p').isVisible(), 'native exclusive disclosure failed')
        assert(await details.last().locator('.home-faq-support a').count() === 2 && await details.last().locator('.home-faq-support').isVisible(), 'static support links are not inside the open question')
        await details.last().locator('summary').press('Enter')
        assert(!await details.last().locator('p').isVisible(), 'native keyboard disclosure failed')
        assert(await section.locator('.home-faq-support a').count() === 2, 'static support links missing')
      }
    } finally { await plain.close() }
  })

  await check('FAQ: pricing Free-plan downloads let phones copy the release link', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] })
    try {
      const page = await phone.newPage()
      page.on('pageerror', error => errors.push(String(error)))
      await page.goto(`${base}/zh-CN/pricing/`)
      const download = page.locator('.home-plan-free .download-split')
      assert(await download.locator('.download-primary[data-for="mac"]').count() === 1, 'pricing Free plan lost direct downloads')
      await download.locator('summary').tap()
      await download.locator('.dl-copy').tap()
      const link = await page.evaluate(() => navigator.clipboard.readText())
      assert(link === 'https://github.com/thinkingjimmy/goalloom/releases', 'phone copied the wrong download link')
      assert((await download.locator('.dl-copy').innerText()).includes('已复制'), 'copy completion feedback missing')
    } finally { await phone.close() }
    assert(errors.length === 0, errors.join('\n'))
  })
  writeFileSync(join(artifact, 'faq-split.json'), JSON.stringify({ facts, errors }, null, 2) + '\n')
}
