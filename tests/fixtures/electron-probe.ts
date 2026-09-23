/**
 * [INPUT]: 真正 Electron main、临时中文/空格目录、存储基础库。
 * [OUTPUT]: 驱动/API/提交/回滚/WAL副本/重新打开证据与实际运行版本。
 * [POS]: 仅测试构建入口，永不进入正式应用包。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, rm, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, release, cpus } from 'node:os'
import { openDatabase, transaction, verifyDatabase } from '../../src/main/storage/database'
import { consistentBackup } from '../../src/main/storage/backup'

async function probe(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'Goalloom 中文 空格 '))
  const database = join(root, 'source.sqlite')
  try {
    const db = openDatabase(database)
    try {
      db.exec('CREATE TABLE probe (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
      transaction(db, () => db.prepare('INSERT INTO probe VALUES (?, ?)').run('1', '离线测试'))
      assert.throws(() => transaction(db, () => {
        db.prepare('INSERT INTO probe VALUES (?, ?)').run('2', '应回滚')
        throw new Error('模拟失败')
      }))
      assert.equal(db.prepare('SELECT count(*) AS count FROM probe').get()?.count, 1)
      const path = await consistentBackup(db, join(root, '保护备份'))
      const restoredPath = join(root, 'restored.sqlite')
      await copyFile(path, restoredPath)
      const restored = openDatabase(restoredPath)
      try {
        verifyDatabase(restored)
        assert.equal(restored.prepare('SELECT value FROM probe WHERE id = ?').get('1')?.value, '离线测试')
      } finally { restored.close() }
      console.log(JSON.stringify({
        environment: 'Electron main', electron: process.versions.electron, node: process.versions.node,
        sqlite: db.prepare('SELECT sqlite_version() AS version').get()?.version,
        platform: process.platform, osRelease: release(), arch: process.arch, cpu: cpus()[0]?.model,
        checks: ['import', 'transaction commit', 'transaction rollback', 'WAL backup', 'restore', 'Chinese/space path'],
      }))
    } finally { db.close() }
    const reopened = openDatabase(database)
    try { assert.equal(reopened.prepare('SELECT count(*) AS count FROM probe').get()?.count, 1) } finally { reopened.close() }
    console.log('Electron SQLite 重启连接恢复通过')
  } finally { await rm(root, { recursive: true, force: true }) }
}

app.whenReady().then(probe).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1) })
