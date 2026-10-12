import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { consistentBackup } from '../../src/main/storage/backup/snapshot'

let directory: string
let db: DatabaseSync
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'goalloom 仓库 '))
  db = openDatabase(join(directory, 'source.sqlite'))
  db.exec('CREATE TABLE parent (id TEXT PRIMARY KEY) STRICT; CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id)) STRICT;')
})
afterEach(async () => { db.close(); await rm(directory, { recursive: true, force: true }) })

it('失败不删除旧有效备份，不遗留半写文件', async () => {
  const backupDirectory = join(directory, 'backups')
  const valid = await consistentBackup(db, backupDirectory)
  const original = await readFile(valid)
  const blocked = join(directory, 'not-a-directory')
  await writeFile(blocked, 'occupied')
  await expect(consistentBackup(db, blocked)).rejects.toThrow()
  expect(await readFile(valid)).toEqual(original)
  expect((await readdir(backupDirectory)).filter(path => path.endsWith('.tmp'))).toEqual([])
})

it('拒绝悬空引用的副本并清理本次临时文件', async () => {
  db.exec("PRAGMA foreign_keys = OFF; INSERT INTO child VALUES ('c', 'missing'); PRAGMA foreign_keys = ON;")
  const backups = join(directory, 'backups')
  await expect(consistentBackup(db, backups)).rejects.toThrow('悬空引用')
  expect(await readdir(backups)).toEqual([])
})
