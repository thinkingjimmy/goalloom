/**
 * [INPUT]: Isolated profiles and the production main/renderer/preload/storage entry points.
 * [OUTPUT]: Empty B registered first; populated A exposes the real login and first-join UI.
 * [POS]: Test-only composition with synthetic OS cipher and encrypted HTTP cloud.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { SyncService } from '../../src/main/sync/service'
import { cipher } from '../sync-cost/peer'
import { createCloud } from '../sync-cost/cloud'
import { openPeer, password, seedLocal, settle } from './peer'

const root = process.env['GOALLOOM_SYNC_TEST_PROFILE']!
const profile = join(root, 'alpha')
app.setPath('userData', profile)
app.setAsDefaultProtocolClient = () => false
safeStorage.isEncryptionAvailable = cipher.available
safeStorage.encryptString = cipher.encrypt
safeStorage.decryptString = cipher.decrypt
const cloud = await createCloud()
await seedLocal(profile, 'alpha', 4, cloud)
await seedLocal(join(root, 'beta'), 'beta', 0, cloud)
const b = await openPeer(join(root, 'beta'), 'beta')
await b.service.handle({ type: 'sign-in' })
await b.service.handle({ type: 'create', password })
await settle(b)
const fixture: any = { cloud, b, a: null }
;(globalThis as any).syncJoinFixture = fixture
const start = SyncService.prototype.start
SyncService.prototype.start = async function () {
  const service: any = this
  service.deps.beginSignIn = async (client: any) => {
    const result = await client.auth.refreshSession({ refresh_token: 'alpha' })
    if (!result.data.session) throw Error('Synthetic sign-in failed')
    return result.data.session
  }
  fixture.a = { service: this, storage: service.deps.storage, profile }
  await start.call(this)
}
app.on('will-quit', () => { b.service.stop(); void b.storage.close(); void cloud.close() })
await import('../../src/main/index')
