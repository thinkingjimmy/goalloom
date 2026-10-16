/**
 * [INPUT]: Production SyncService and real Electron storage against a counted cloud boundary.
 * [OUTPUT]: Repeated-idle RPC baseline and runtime/platform evidence; synthetic content only.
 * [POS]: M0 acceptance captured before changing production scheduling.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, platform, release, arch, tmpdir } from 'node:os'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from './cloud'
import { cipher, seed, worker } from './peer'

async function main() {
  const out = resolve('output/tests/sync-cost')
  await mkdir(out, { recursive: true })
  const directory = await mkdtemp(join(tmpdir(), 'goalloom-sync-baseline-'))
  const cloud = await createCloud()
  await seed(directory, 'alpha', cloud.world, cloud.url)
  await seed(join(directory, 'beta'), 'beta', cloud.world, cloud.url)
  const storage = await worker(directory)
  let status: any
  const service = new SyncService({ userData: directory, storage, cipher, openExternal: async () => {}, notify: next => { status = next }, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString() })
  try {
    await service.start()
    assert.equal(status.phase, 'ready')
    const start = cloud.requests.length
    for (let i = 0; i < 30; i++) await service.handle({ type: 'retry' })
    const requests = cloud.requests.slice(start)
    assert.equal(requests.filter(row => row.rpc === 'get_roster').length, 30)
    assert.equal(requests.filter(row => row.rpc === 'pull_ops').length, 30)
    const runtime = await storage.call('runtime')
    await writeFile(join(out, 'baseline.json'), JSON.stringify({ ok: true, scope: 'Production SyncService, SDK HTTP/WebSocket and storage worker in Electron Node; synthetic cloud and cipher. No native window or hosted SQL acceptance.',
      runtime, process: { electron: process.versions.electron, node: process.versions.node, os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machine: 'Physical/VM not verified' },
      source: process.env.GOALLOOM_BASELINE_REF, idleTriggers: 30, requests, requestsPerIdleTrigger: requests.length / 30,
      findings: { requestDeadline: false, cancellation: false, uploadFailureBlocksPull: true },
      remoteChecks: 'Unverified: no hosted SQL/admin credentials in the environment.',
    }, null, 2))
    console.log(`M0 baseline passed: ${requests.length} RPCs for 30 unchanged triggers; Electron ${process.versions.electron}`)
  } finally {
    service.stop()
    // The baseline measures traffic, not the old coordinator's SDK teardown.
    const client = (service as any).client
    client?.auth.stopAutoRefresh()
    client?.realtime.disconnect()
    await storage.close(); await cloud.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
