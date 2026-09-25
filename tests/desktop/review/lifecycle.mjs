// Failure cases: (1) a renderer reload loses the UI-only transfer token while
// storage remains in maintenance; (2) macOS Ctrl+K is misread as Command+K,
// preventing native deletion to end of line. Isolated data; no production edits.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const root = resolve('.')
const require = createRequire(join(root, 'package.json'))
const { _electron: electron } = require('playwright')
const profile = await mkdtemp(join(tmpdir(), 'goalloom-review-reload-'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const result = { scope: 'Real Electron on macOS, current out build, isolated profile, no packaged or Windows acceptance', profile }
let app
try {
  app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], env })
  let page = await app.firstWindow()
  await page.waitForFunction(() => Boolean(window.goalloom))
  result.before = await app.evaluate(({ Menu }) => ({ pid: process.pid, platform: process.platform, menu: Menu.getApplicationMenu()?.items.flatMap(item => item.submenu?.items.map(child => ({ label: child.label, role: child.role, accelerator: child.accelerator, enabled: child.enabled })) ?? []) }))
  await page.evaluate(async () => {
    const s = await window.goalloom.getSnapshot()
    await window.goalloom.execute({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-09-01', confirmed: true, generation: s.workspace.generation, operationId: crypto.randomUUID() })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Add to Later', exact: true }).waitFor()
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'native-shortcut-probe'; input.value = 'Keep me remove me'
    input.addEventListener('keydown', event => event.stopPropagation())
    document.body.append(input); input.focus(); input.setSelectionRange(7, 7)
  })
  await page.keyboard.press('Control+k')
  result.nativeControlK = await page.locator('#native-shortcut-probe').inputValue()
  assert.equal(result.nativeControlK, 'Keep me')
  await page.evaluate(() => document.querySelector('#native-shortcut-probe').remove())
  await page.getByRole('button', { name: 'Add to Later', exact: true }).click()
  await page.locator('.quick-add input').fill('Keep me remove me')
  await page.locator('.quick-add input').evaluate(input => input.setSelectionRange(7, 7))
  await page.evaluate(() => { window.addEventListener('keydown', event => { if (event.ctrlKey && event.code === 'KeyK') window.probePrevented = event.defaultPrevented }) })
  await page.locator('.quick-add input').press('Control+k')
  assert.equal(await page.locator('dialog.palette').count(),0)
  result.appControlK = { value: await page.locator('.quick-add input').inputValue(), paletteOpened: await page.locator('dialog.palette').count(), defaultPrevented: await page.evaluate(() => window.probePrevented) }
  assert.equal(result.appControlK.value,result.nativeControlK)
  assert.equal(result.appControlK.defaultPrevented,false)
  await page.locator('.quick-add input').press('Meta+k')
  await page.locator('dialog.palette').waitFor()
  await page.locator('dialog.palette .modal-header').getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.quick-add input').fill('')
  await page.locator('.quick-add input').press('Escape')
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Backup & restore', exact: true }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Create protective backup and continue', exact: true }).click()
  await page.locator('.settings-footer input[type=checkbox]').waitFor()
  result.prepared = await page.evaluate(async () => ({ maintenance: (await window.goalloom.getSnapshot()).maintenance, runtime: await window.goalloom.getRuntime(), confirmationVisible: Boolean(document.querySelector('.settings-footer input[type=checkbox]')) }))
  assert.equal(result.prepared.maintenance, true)
  await page.screenshot({ path: join(root, 'output/tests/review-fixes/reload-prepared.png') })
  // Playwright keyboard injection did not activate the native menu accelerator
  // in the initial run. Invoke the observed Reload menu item itself instead.
  result.reloadTrigger = 'Native Reload menu item click; observed accelerator CmdOrCtrl+R'
  await Promise.all([page.waitForEvent('domcontentloaded', { timeout: 10000 }), app.evaluate(({ Menu, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const reload = Menu.getApplicationMenu().items.flatMap(item => item.submenu?.items ?? []).find(item => item.role === 'reload')
    reload.click({ triggeredByAccelerator: false }, window, window.webContents)
  })])
  await page.waitForFunction(() => Boolean(window.goalloom))
  result.reloaded = await page.evaluate(async () => {
    const api = window.goalloom, s = await api.getSnapshot()
    return { maintenance: s.maintenance, settingsVisible: Boolean(document.querySelector('dialog.settings-modal')), create: await api.execute({ type: 'create', title: 'After renderer reload', horizon: 'later', generation: s.workspace.generation, operationId: crypto.randomUUID() }), preview: await api.data({ type: 'previewReset', generation: s.workspace.generation }).catch(error => String(error)) }
  })

  assert.equal(result.reloaded.maintenance,false)
  assert.equal(result.reloaded.create.ok,true)
  assert.equal(result.reloaded.preview.type,'preview')
  for(const mode of ['close','crash']) {
    const prepared=await page.evaluate(async()=>{
      const api=window.goalloom,generation=(await api.getSnapshot()).workspace.generation
      const preview=await api.data({type:'previewReset',generation})
      await api.data({type:'prepare',generation,token:preview.preview.token})
      return (await api.getSnapshot()).maintenance
    })
    assert.equal(prepared,true)
    if(mode==='close') {
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].destroy())
      const next=app.waitForEvent('window')
      await app.evaluate(({app})=>app.emit('activate'))
      page=await next
    } else {
      await Promise.all([page.waitForEvent('crash'),app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer())])
      const snapshot=await app.evaluate(async({BrowserWindow})=>{
        const contents=BrowserWindow.getAllWindows()[0].webContents
        await new Promise(resolve=>{contents.once('did-finish-load',resolve);contents.reload()})
        return contents.executeJavaScript('window.goalloom.getSnapshot()')
      })
      assert.equal(snapshot.maintenance,false)
      result[mode]={maintenance:snapshot.maintenance}
      continue
    }
    await page.waitForFunction(()=>Boolean(window.goalloom))
    const snapshot=await page.evaluate(()=>window.goalloom.getSnapshot())
    assert.equal(snapshot.maintenance,false)
    result[mode]={maintenance:snapshot.maintenance}
  }
  result.afterPid = await app.evaluate(() => process.pid)
  const capture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await writeFile(join(root,'output/tests/review-fixes/reload-maintenance.png'),Buffer.from(capture,'base64'))
} catch (error) { result.error = String(error); process.exitCode = 1 }
finally { if (app) await app.close(); await writeFile(join(root, 'output/tests/review-fixes/reload-shortcut-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({scope:result.scope,checks:['nativeControlK','appControlK','prepared','reloaded','close','crash'],error:result.error ?? null})) }
