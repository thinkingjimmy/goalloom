/**
 * [INPUT]: Explicit fixed-review CLI instant, current production artifacts and isolated native profiles.
 * [OUTPUT]: Test-only main/worker bundles, unchanged production hashes and actual guarded-write/restart evidence.
 * [POS]: Shared review runner composition; no new runtime clock control or renderer mock.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { build } from 'vite'

const fixturePrefix = 'review-clock-'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function productionHashes() {
  const files = {}
  for (const directory of ['out', 'src']) for (const name of await readdir(directory, { recursive: true })) {
    if (name.split('/').some(part => part.startsWith(fixturePrefix)) || !/\.(?:ts|tsx|js|cjs|css|html|node)$/.test(name)) continue
    const path = join(directory, name); files[path] = digest(await readFile(path))
  }
  return files
}
export async function fixedReviewClock(argv) {
  const flags = argv.filter(value => value.startsWith('--fixed-at'))
  if (!flags.length) return null
  assert.equal(flags.length, 1, 'Use exactly one fixed instant')
  assert(flags[0].startsWith('--fixed-at='), 'Use --fixed-at=<canonical UTC instant>')
  const at = flags[0].slice('--fixed-at='.length)
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) && new Date(at).toISOString() === at, 'Invalid fixed instant')
  const prefix = `${fixturePrefix}${randomUUID()}-`, owned = new Set()
  const collect = async () => { for (const name of await readdir('out/main')) if (name.startsWith(prefix)) owned.add(join('out/main', name)) }
  const cleanup = async () => {
    await collect()
    for (const file of owned) { try { await unlink(file) } catch (error) { if (error.code !== 'ENOENT') throw error } }
  }
  const fixtureFiles = ['tests/month-review.mjs', 'tests/review-scopes.mjs', 'tests/fixtures/review-seed.ts', ...['build.mjs', 'clock.ts', 'entry.ts', 'storage-client.ts'].map(name => `tests/fixtures/review-clock/${name}`)]
  const fixtureHashes = async () => Object.fromEntries(await Promise.all(fixtureFiles.map(async file => [file, digest(await readFile(file))])))
  const fixtureBefore = await fixtureHashes()
  const before = await productionHashes(), mainPath = resolve(`out/main/${prefix}main.js`), workerPath = resolve(`out/main/${prefix}storage.js`)
  const aliases = { main: [], worker: [] }, mainSource = resolve('src/main/index.ts'), clockSource = resolve('src/main/storage/workspace-clock.ts')
  const alias = kind => ({ name: `fixed-review-${kind}`, enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return
    const target = resolve(dirname(importer), source).replace(/\.ts$/, '')
    if (target === clockSource.replace(/\.ts$/, '')) { aliases[kind].push({ source, importer, role: 'clock' }); return resolve('tests/fixtures/review-clock/clock.ts') }
    if (kind === 'main' && importer === mainSource && source === './storage/client') { aliases.main.push({ source, importer, role: 'client' }); return resolve('tests/fixtures/review-clock/storage-client.ts') }
  } })
  try {
    for (const [kind, entry] of [['worker', 'src/main/storage/worker.ts'], ['main', 'tests/fixtures/review-clock/entry.ts']]) {
      await build({ configFile: false, ssr: { noExternal: true }, plugins: [alias(kind)], define: {
        __GOALLOOM_REVIEW_AT__: JSON.stringify(at), __GOALLOOM_REVIEW_WORKER__: JSON.stringify(workerPath),
        __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""',
      }, build: { ssr: true, target: 'node24', minify: false, outDir: 'out/main', emptyOutDir: false,
        lib: { entry, formats: ['es'], fileName: () => `${prefix}${kind === 'main' ? 'main' : 'storage'}.js` },
        rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: `${prefix}${kind === 'main' ? 'main' : 'storage'}.js`, chunkFileNames: `${prefix}[name]-[hash].js` } },
      } })
    }
    assert(aliases.main.some(row => row.role === 'client'))
    assert(aliases.main.some(row => row.role === 'clock' && row.importer === mainSource))
    assert(aliases.worker.some(row => row.role === 'clock'))
    await collect()
    const bundles = {}
    for (const name of await readdir('out/main')) if (name.startsWith(prefix)) bundles[name] = digest(await readFile(join('out/main', name)))
    return { at, mainPath, seedArguments: [`--fixed-at=${at}`], manifest: { at, zone: 'Asia/Shanghai', aliases, bundles, fixtureBefore, productionBefore: before },
      async verify(application, page, fixture) {
        assert.equal(fixture.clockAt, at)
        const main = await application.evaluate(() => { const { at, nowMs, external } = globalThis.reviewClockFixture; return { at, nowMs, external } })
        assert.equal(main.at, at); assert.equal(main.nowMs, Date.parse(at)); assert.deepEqual(main.external, [])
        await application.evaluate(({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0]
          if (window.isVisible()) return
          return new Promise(resolve => window.once('show', resolve))
        })
        const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
        assert.equal(snapshot.observedAt, at); assert.equal(snapshot.workspace.clockAnomaly, false)
        const periods = Object.fromEntries(snapshot.periods.map(period => [period.horizon, period]))
        assert.equal(periods.day.startDate, periods.month.startDate)
        assert.equal(periods.week.startAt, periods.month.startAt)
        return { main, observedAt: snapshot.observedAt, generation: snapshot.workspace.generation, periods }
      },
      async expiredWrite(application, page, fixture) {
        const tables = () => application.evaluate(() => globalThis.reviewClockFixture.databaseHashes())
        const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
        const parentId = fixture.roots[0], parent = await page.evaluate(id => window.goalloom.getItem(id), parentId)
        assert(Date.parse(fixture.expiredWeek.endAt) <= Date.parse(at))
        const beforeRows = await tables()
        const reply = await page.evaluate(async input => window.goalloom.execute(input), {
          type: 'createPlan', operationId: randomUUID(), generation: snapshot.workspace.generation, items: [{
            draftId: randomUUID(), title: 'Expired period must reject', horizon: 'week', previewPeriodId: fixture.expiredWeek.id,
            period: { kind: 'date', startDate: fixture.expiredWeek.startDate }, parentRefs: [{ kind: 'existing', itemId: parentId, expectedVersion: parent.item.version }],
          }],
        })
        assert.equal(reply.ok, false); assert.equal(reply.code, 'stale_preview'); assert.match(reply.message, /该周期已结束/)
        const after = await page.evaluate(() => window.goalloom.getSnapshot())
        assert.equal(after.workspace.revision, snapshot.workspace.revision); assert.deepEqual(await tables(), beforeRows)
        return { code: reply.code, message: reply.message, generation: snapshot.workspace.generation, parentVersion: parent.item.version, expiredPeriod: fixture.expiredWeek, revision: after.workspace.revision, tableHashes: beforeRows }
      },
      async finish() {
        try {
          const after = await productionHashes(), fixtureAfter = await fixtureHashes()
          const added = Object.keys(after).filter(name => !(name in before)), removed = Object.keys(before).filter(name => !(name in after))
          const changed = Object.keys(before).filter(name => name in after && before[name] !== after[name])
          const fixtureChanged = fixtureFiles.filter(file => fixtureBefore[file] !== fixtureAfter[file])
          return { sourceStable: !added.length && !removed.length && !changed.length && !fixtureChanged.length, added, removed, changed, fixtureChanged, fixtureAfter, productionAfter: after }
        } finally { await cleanup() }
      },
    }
  } catch (error) {
    try { await cleanup() } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Fixed review build and cleanup failed') }
    throw error
  }
}
