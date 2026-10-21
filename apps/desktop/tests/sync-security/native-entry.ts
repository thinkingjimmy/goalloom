/**
 * [INPUT]: Isolated profiles and synthetic HTTP/cloud/cipher/connectivity boundaries.
 * [OUTPUT]: Production main/preload/renderer/SQLite with two independent encrypted accounts.
 * [POS]: Native security acceptance composition; no production key or Wi-Fi change.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, net, safeStorage } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SyncService } from '../../src/main/sync/service'
import { UpdateService } from '../../src/main/update'
import { openOpWire } from '@goalloom/sync'
import { cipher } from '../sync-cost/peer'
import { createCloud } from '../sync-cost/cloud'
import { installSessionKey } from '../fixtures/session-key'
import { closePeer, command, openPeer, password, seedLocal, settle, tasks } from '../sync-join/peer'

const root = process.env['GOALLOOM_SYNC_TEST_PROFILE']!
const profile = join(root, 'alpha')
const workerPath = fileURLToPath(new URL('storage.js', import.meta.url))
app.setPath('userData', profile)
app.setAsDefaultProtocolClient = () => false
UpdateService.prototype.start = () => {}
safeStorage.isEncryptionAvailable = cipher.available
safeStorage.encryptString = cipher.encrypt
safeStorage.decryptString = cipher.decrypt
installSessionKey(new URL('keychain-policy.node', import.meta.url))
const cloud = await createCloud()
await seedLocal(profile, 'alpha', 3, cloud)
await seedLocal(join(root, 'beta'), 'beta', 0, cloud)
await seedLocal(join(root, 'other'), 'beta', 0, cloud)
const other = await openPeer(join(root, 'other'), 'other-beta', workerPath)
await other.service.handle({ type: 'sign-in', provider: 'google' }); await other.service.handle({ type: 'create', password })
await command(other, { type: 'create', title: 'Other account cloud task', horizon: 'day' }); await settle(other)
const fixture: any = { cloud, a: null, b: null, other, online: true, identity: 'alpha', root, profile, tasks,
  cloudTaskTitles() {
    const secrets = fixture.a.service.secrets
    const workspace = cloud.world.workspaces.get(secrets.workspaceId)
    return workspace?.ops.flatMap(row => openOpWire(row, { workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey }).actions
      .flatMap(action => action.t === 'item.create' ? [action.title] : [])) ?? []
  },
  async connectB() {
    const b = fixture.b = await openPeer(join(root, 'beta'), 'beta', workerPath)
    await b.service.handle({ type: 'sign-in', provider: 'google' }); await b.service.handle({ type: 'submit-password', password }); await settle(b)
  },
  async settle() {
    for (let turn = 0; turn < 5; turn++) for (const peer of [fixture.a, fixture.b, other].filter(Boolean)) {
      await peer.service.operation; await peer.service.schedule.settle(); await peer.service.handle({ type: 'retry' })
      if (peer.clock) await peer.clock.advance(0)
      await peer.service.schedule.settle()
    }
  },
}
net.isOnline = () => fixture.online
;(globalThis as any).syncSecurityFixture = fixture
const start = SyncService.prototype.start
SyncService.prototype.start = async function () {
  const service: any = this
  if (!service.deps.monitorNetwork) { await start.call(this); return }
  service.deps.beginSignIn = async (client: any) => {
    const result = await client.auth.refreshSession({ refresh_token: fixture.identity })
    if (!result.data.session) throw Error('Synthetic sign-in failed')
    return result.data.session
  }
  fixture.a = { service, storage: service.deps.storage, profile }
  await start.call(this)
}
app.on('will-quit', () => {
  for (const peer of [fixture.b, other].filter(Boolean)) void closePeer(peer)
  void cloud.close()
})
await import('../../src/main/index')
