import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dateCandidates } from '../../../src/domain/smart/dates.ts'
import { planQuestions, relationRound, estimateTokens } from '../../../src/domain/smart/questions.ts'
import { SmartInputService } from '../../../src/main/smart/service.ts'

// Failure cases: compound dates must not become shorter dates; all rounds must fit
// the payload budget; cache must refresh parent versions; disabling must win over
// a previously started connection test. Fixtures never send requests or read keys.
const periods = Object.fromEntries(['day', 'week', 'month', 'cycle'].map(h => [h, { id: `c:${h}:2026-09-24`, startDate: '2026-09-24', endDate: '2026-09-25' }]))
const context = text => ({ text, referenceDate: '2026-09-24', weekdayName: '周四', timezone: 'Asia/Shanghai', weekStart: 1, periods, candidates: [] })
const results=[]
console.log('DATES', JSON.stringify(['下月底前交稿', '大后天前交稿'].map(text => ({ text, actual: dateCandidates(text, '2026-09-24', 1) }))))
for (const length of [200, 300, 400]) {
  const ctx = context(Array.from({ length: 8 }, (_, i) => `事项${i}${'甲'.repeat(length)}`).join('\n'))
  const p = planQuestions(ctx)
  if ('kind' in p) { console.log('PAYLOAD', length, p); continue }
  const next = relationRound(p, p.slots.map(s => s.id), [], Object.keys(p.questions).length)
  console.log('PAYLOAD', JSON.stringify({ slotLength: length, firstBytes: Buffer.byteLength(JSON.stringify({ state: p.state, questions: p.questions })), secondBytes: Buffer.byteLength(JSON.stringify({ state: next.state, questions: next.questions })), questions: Object.keys(p.questions).length + Object.keys(next.questions).length }))
}
const generation = 'review-generation'
let config = { version: 1, activeProvider: 'typesafe', providerRevision: 1, enabledForGeneration: generation, dismissed: [], lastFailure: null,
 providers: { typesafe: { consentedAt: '2026-09-24T00:00:00Z', verifiedAt: '2026-09-24T00:00:00Z', keyHint: 'fixture' }, 'vercel-gateway': { consentedAt: null, verifiedAt: null, keyHint: null } } }
const store = { config: async () => structuredClone(config), saveConfig: async next => { config = structuredClone(next) }, readKey: async () => ({ state: 'saved', key: 'synthetic-fixture' }), saveKey: async () => 'fixture', removeKey: async () => {} }
let version = 1, calls = 0
const answer = async (_key, req) => {
 calls++
 const answers = Object.fromEntries(Object.entries(req.questions).map(([id, q]) => {
  if (q.type === 'boolean') return [id, { type: 'boolean', probability: id.startsWith('rel_') || id === 'task' ? 0.99 : 0.01 }]
  const keys = Object.keys(q.criteria), choice = id.startsWith('role_') ? 'task' : id === 'layout' ? 'single' : id.startsWith('horizon') ? (id === 'horizon' ? 'day' : 'later') : id.startsWith('due_') ? 'none' : keys[0]
  return [id, { type: 'choice', choice, probabilities: Object.fromEntries(keys.map(k => [k, k === choice ? 1 : 0])) }]
 }))
 return { answers, precision: { decimals: 2, source: 'adapter' }, meta: { requestedModel: 'fixture', routingCanonicalSlug: null, modelVersion: null, inputTokens: null, requestId: null } }
}
let adapter = answer
const service = new SmartInputService({ store, adapters: { typesafe: (...args) => adapter(...args), 'vercel-gateway': answer }, reader: { generation: async () => generation, context: async text => ({ ...context(text), candidates: [{ ref: 'g1', itemId: 'parent', title: 'Parent', status: 'todo', horizon: 'cycle', archived: false, flowColor: 0, version, named: true }] }) }, unsignedBuild: true })
const req = () => ({ requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 1, manualRevision: 0, generation, providerRevision: 1, contextRevision: version, referenceTime: '2026-09-24T00:00:00Z', text: '推进 Parent', parentHints: [] })
const first = await service.analyze(req())
version = 2
const second = await service.analyze(req())
assert.equal(second.preview.candidates[0].version,version)
results.push({case:'cache',version:second.preview.candidates[0].version})
console.log('CACHE', JSON.stringify({ providerCalls: calls, oldVersion: first.preview.candidates[0].version, currentVersion: version, returnedVersion: second.preview.candidates[0].version, echoedContextRevision: second.echo.contextRevision }))
let release, entered
const gate = new Promise(resolve => { release = resolve })
const started = new Promise(resolve => { entered = resolve })
adapter = async (...args) => { entered(); await gate; return answer(...args) }
const connecting = service.handle({ type: 'connect', generation, provider: 'typesafe', apiKey: null, consent: true })
await started
await service.handle({ type: 'disable', generation })
const disabled = await service.status(generation)
release()
await connecting
console.log('DISABLE_RACE', JSON.stringify({ enabledAfterDisable: disabled.enabled, enabledAfterEarlierConnectCompletes: (await service.status(generation)).enabled }))

assert.equal((await service.status(generation)).enabled,false)
for (const action of [{type:'forget',provider:'typesafe'}, {type:'connect',provider:'vercel-gateway',apiKey:null,consent:true}]) {
 let finish,started
 const gate=new Promise(resolve=>{finish=resolve})
 const begun=new Promise(resolve=>{started=resolve})
 adapter=async(...args)=>{started();await gate;return answer(...args)}
 const pending=service.handle({type:'connect',generation,provider:'typesafe',apiKey:'synthetic-new-key',consent:true})
 await begun
 await service.handle({...action,generation})
 finish();await pending
 assert.notEqual((await service.status(generation)).activeProvider,'typesafe')
}
const dates=[['下月底', '2026-10-31'],['10月底','2026-10-31'],['十月底','2026-10-31'],['下个月底','2026-10-31'],['大后天','2026-09-27'],['上周五','2026-09-18'],['上星期五','2026-09-18']]
for(const [text,expected] of dates) assert.equal(dateCandidates(text+'前交稿','2026-09-24',1)[0]?.value,expected)
for(const text of ['大大后天','上上上周五','13月底','去年10月底','2027年10月底']) {
 const values=dateCandidates(text,'2026-09-24',1)
 assert.ok(values.every(value=>value.value===null || value.text===text),text)
}
for(const length of [200,300,400]) {
 const ctx=context(Array.from({length:8},(_,i)=>`事项${i}${'甲'.repeat(length)}`).join('\n'))
 const plan=planQuestions(ctx);assert.ok(!('kind' in plan))
 const next=relationRound(plan,plan.slots.map(slot=>slot.id),[],Object.keys(plan.questions).length)
 const body=JSON.stringify({state:next.state,questions:next.questions})
 assert.ok(Buffer.byteLength(body)<=65536)
 assert.ok(estimateTokens(body)<=24000)
 assert.ok(next.pairs.some(pair=>pair.key===null))
 results.push({case:'payload',length,bytes:Buffer.byteLength(body),tokens:estimateTokens(body)})
}
await mkdir('output/tests/review-fixes',{recursive:true})
await writeFile('output/tests/review-fixes/smart.json',JSON.stringify({results,dates,runtime:process.versions},null,2))
console.log('Smart service review regressions passed')
