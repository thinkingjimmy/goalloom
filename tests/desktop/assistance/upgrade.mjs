/**
 * [INPUT]: Synthetic legacy profiles, real production boot and scripted native-dialog responses.
 * [OUTPUT]: Reachable startup prepare/confirm/cancel evidence and unchanged-source checks.
 * [POS]: Native startup E2E; dialog decisions are synthesized, physical installation remains separate.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const out = resolve('output/tests/assistance')
await build({ entryPoints: ['tests/desktop/assistance/legacy.ts'], outfile: `${out}/legacy.mjs`, bundle: true, platform: 'node', format: 'esm', external: ['node:*'] })
const entry = `${out}/upgrade-main.mjs`
await writeFile(entry, `import { dialog } from 'electron';
import { writeFileSync } from 'node:fs';
const calls = [];
dialog.showMessageBox = async options => {
  calls.push({ title: options.title, message: options.message, detail: options.detail, buttons: options.buttons });
  writeFileSync(process.env.GOALLOOM_UPGRADE_REPORT, JSON.stringify({ calls }));
  const step = calls.length;
  return { response: process.env.GOALLOOM_UPGRADE_CASE === 'cancel-first' || process.env.GOALLOOM_UPGRADE_CASE === 'cancel-confirm' && step === 2 ? 1 : 0, checkboxChecked: false };
};
await import(${JSON.stringify(`file://${resolve('out/main/index.js')}`)});
`)
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(electronPath, args, { env, stdio: 'inherit' })
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Upgrade fixture exited ${code}`)))
})
const cases = []
for (const mode of ['cancel-first', 'cancel-confirm', 'commit']) {
  const profile = await mkdtemp(join(tmpdir(), 'Goalloom legacy startup '))
  const evidence = `${out}/upgrade-${mode}.json`
  let application
  try {
    await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
    await run([`${out}/legacy.mjs`, profile], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
    const hash = async () => createHash('sha256').update(await readFile(join(profile, 'workspace.sqlite'))).digest('hex')
    const original = await hash(), env = { ...process.env, GOALLOOM_UPGRADE_CASE: mode, GOALLOOM_UPGRADE_REPORT: evidence }
    delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
    if (mode !== 'commit') {
      await run([entry, `--user-data-dir=${profile}`], env)
      if (await hash() !== original) throw Error('Cancelled startup upgrade changed the source')
    } else {
      application = await electron.launch({ args: [entry, `--user-data-dir=${profile}`], env })
      const page = await application.firstWindow()
      await page.locator('.board').waitFor()
      const state = await page.evaluate(() => window.goalloom.getSnapshot())
      if (state.workspace.theme !== 'dark' || state.workspace.style !== 'minimal' || state.workspace.checkStyle !== 'tint') throw Error('Startup upgrade reset saved appearance')
      const legacy = await page.evaluate(() => window.goalloom.listItems({ type: 'list', view: 'search', query: 'Synthetic legacy v7 task', offset: 0, limit: 50 }))
      if (legacy.items[0]?.title !== 'Synthetic legacy v7 task' || !state.workspace.pausedAfterRestore) throw Error('Startup upgrade did not retain legacy data and the restore pause')
      await page.screenshot({ path: `${out}/upgraded-v7.png` })
      const item = await page.evaluate(id => window.goalloom.getItem(id), legacy.items[0].id)
      if (item.item.description !== 'Preserve this saved text' || item.guidance !== null) throw Error('Startup upgrade fabricated or lost guidance/content')
    }
    const result = JSON.parse(await readFile(evidence, 'utf8'))
    if (result.calls.length !== (mode === 'cancel-first' ? 1 : 2)) throw Error('Startup recovery was not reachable')
    cases.push({ mode, sourceUnchanged: mode !== 'commit', appearancePreserved: mode === 'commit', dialogs: result.calls.length })
    console.log(`✓ native startup upgrade: ${mode}`)
  } finally { await application?.close(); await rm(profile, { recursive: true, force: true }) }
}
await writeFile(`${out}/upgrade-report.json`, JSON.stringify({ ok: true, scope: 'Production Electron boot and real SQLite upgrade, synthetic native-dialog decisions; no physical installer acceptance', cases }, null, 2))
