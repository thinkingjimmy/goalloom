/**
 * [INPUT]: Isolated profile and the built production renderer/preload/storage.
 * [OUTPUT]: Full application with controlled cloud/cipher/clock at existing service boundaries.
 * [POS]: Test-only composition wrapper. Production bundles expose no fixture API.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, safeStorage } from 'electron'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from './cloud'
import { cipher, seed } from './peer'
import { Clock } from './clock'

const profile = process.env['GOALLOOM_SYNC_TEST_PROFILE']!
app.setPath('userData', profile)
app.setAsDefaultProtocolClient = () => false
safeStorage.isEncryptionAvailable = cipher.available
safeStorage.encryptString = cipher.encrypt
safeStorage.decryptString = cipher.decrypt
const cloud = await createCloud(), clock = new Clock()
await seed(profile, 'alpha', cloud.world, cloud.url)
const fixture: any = { cloud, clock, service: null }
;(globalThis as any).syncFixture = fixture
const start = SyncService.prototype.start
SyncService.prototype.start = async function () {
  fixture.service = this
  ;(this as any).deps.clock = clock
  ;(this as any).schedule.input.clock = clock
  ;(this as any).schedule.input.random = () => 1
  await start.call(this)
}
app.on('will-quit', () => { void cloud.close() })
await import('../../src/main/index')
