/**
 * [INPUT]: An isolated fixed-review profile, matching seed manifest and test-only build aliases.
 * [OUTPUT]: Real application/preload/renderer with a fixed workspace clock and blocked external calls.
 * [POS]: Native acceptance composition; no global Date replacement or production clock setting.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, net, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { workspaceClock } from '../../../src/main/storage/workspace-clock'
import { UpdateService } from '../../../src/main/update'
const profile = app.getPath('userData')
if (!basename(profile).startsWith('goalloom-review-fixed-')) throw Error('Fixed review requires an isolated profile')
const fixture = JSON.parse(readFileSync(join(profile, 'review-fixture.json'), 'utf8'))
if (fixture.clockAt !== workspaceClock.now()) throw Error('Fixed review seed/main mismatch')
const evidence = { at: workspaceClock.now(), nowMs: workspaceClock.nowMs(), external: [] as string[],
  databaseHashes() {
    const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true })
    try { return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => {
      const quoted = `"${String(row.name).replaceAll('"', '""')}"`, count = db.prepare(`PRAGMA table_info(${quoted})`).all().length
      const rows = db.prepare(`SELECT * FROM ${quoted} ORDER BY ${Array.from({ length: count }, (_, index) => index + 1).join(',')}`).all()
      return [String(row.name), createHash('sha256').update(JSON.stringify(rows)).digest('hex')]
    })) } finally { db.close() }
  },
}
;(globalThis as any).reviewClockFixture = evidence
app.setAsDefaultProtocolClient = () => false
UpdateService.prototype.start = () => {}
const blocked = async (input: unknown): Promise<never> => { evidence.external.push(String(input)); throw Error('Fixed review blocks external calls') }
net.fetch = blocked
shell.openExternal = blocked
await import('../../../src/main/index')
