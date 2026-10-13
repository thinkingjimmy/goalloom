import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { randomUUID } from 'expo-crypto'
import { applySyncOp, mergeRemoteOps, rebuildVisibleFull } from '@goalloom/store-core'
import { parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { expoDriver, host, installV9, openFresh } from './db'
import { runPhase0 } from './phase0'

const at = () => new Date().toISOString()

function List() {
  const [driver] = useState(() => {
    const opened = openFresh('phase0-list.db')
    installV9(opened, 'phone', at())
    return expoDriver(opened)
  })
  const [title, setTitle] = useState('')
  const [items, setItems] = useState([])
  const [note, setNote] = useState('')

  const reload = useCallback(() => {
    setItems(driver.prepare(`SELECT i.id AS id, i.title AS title FROM items i JOIN item_placements p ON p.itemId=i.id
      WHERE i.deletedAt IS NULL ORDER BY p.sortKey, i.id`).all())
  }, [driver])

  useEffect(() => { reload() }, [reload])

  function remember(op) {
    const payload = syncOpPayload(op)
    const order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
    driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, op.at, op.at)
  }

  function add() {
    const text = title.trim()
    if (!text) return
    const previous = items.at(-1)?.id ?? null
    const op = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: 'phone', at: at(),
      actions: [{ t: 'item.create', id: randomUUID(), title: text, description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: previous, beforeId: null } }],
    })
    applySyncOp(driver, op, 'visible', host)
    remember(op)
    setTitle('')
    setNote('')
    reload()
  }

  function move(index, direction) {
    const next = index + direction
    if (next < 0 || next >= items.length) return
    const item = items[index]
    const neighbor = items[next]
    const op = parseSyncOp({
      v: 1, opId: randomUUID(), deviceId: 'phone', at: at(),
      actions: [{
        t: 'item.place', id: item.id, horizon: 'later', periodKey: null,
        sortHint: direction < 0 ? { afterId: null, beforeId: neighbor.id } : { afterId: neighbor.id, beforeId: null },
        reason: 'move',
      }],
    })
    applySyncOp(driver, op, 'visible', host)
    remember(op)
    setNote('')
    reload()
  }

  function rejectRemote() {
    const seq = Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0) + 1
    const op = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: 'other', at: at(), actions: [{ t: 'item.set', id: 'missing', fields: { title: 'nope' } }] })
    mergeRemoteOps(driver, [{ seq, op }], host, at())
    const row = driver.prepare('SELECT code FROM sync_conflicts WHERE seq=?').get(seq)
    setNote(row ? `远端 op 已拒绝：${row.code}` : '远端 op 没有写入冲突')
    reload()
  }

  function rebuild() {
    rebuildVisibleFull(driver, host)
    setNote('已按基线重放未发送的本地 op')
    reload()
  }

  return (
    <View style={styles.list}>
      <Text style={styles.section}>本地列表</Text>
      <View style={styles.row}>
        <TextInput value={title} onChangeText={setTitle} placeholder="新事项" style={styles.input} />
        <Pressable style={styles.button} onPress={add}><Text style={styles.buttonText}>添加</Text></Pressable>
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Pressable onPress={() => move(index, -1)}><Text style={styles.link}>上移</Text></Pressable>
          <Pressable onPress={() => move(index, 1)}><Text style={styles.link}>下移</Text></Pressable>
        </View>
      ))}
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={rejectRemote}><Text style={styles.buttonText}>拒绝远端</Text></Pressable>
        <Pressable style={styles.button} onPress={rebuild}><Text style={styles.buttonText}>重建</Text></Pressable>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  )
}

export default function App() {
  const [rows, setRows] = useState([])
  useEffect(() => { setRows(runPhase0()) }, [])
  const failed = rows.filter(row => !row.ok).length
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Phase 0</Text>
      <Text style={styles.summary}>{rows.length ? `${rows.length - failed}/${rows.length} 通过` : '运行中'}</Text>
      {rows.map(row => (
        <Text key={row.name} selectable style={row.ok ? styles.pass : styles.fail}>
          {row.ok ? '通过' : '失败'}  {row.name}  {row.ms}ms{row.detail ? `\n${row.detail}` : ''}
        </Text>
      ))}
      <List />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 28, fontWeight: '600' },
  summary: { fontSize: 16, marginBottom: 8 },
  pass: { color: '#176b3a' },
  fail: { color: '#9b1c1c' },
  list: { marginTop: 24, gap: 8 },
  section: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#1f2933', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  buttonText: { color: 'white' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  itemTitle: { flex: 1, fontSize: 16 },
  link: { color: '#1d4e89' },
  note: { color: '#1f2933' },
})
