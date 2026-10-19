#!/usr/bin/env node
/**
 * Optimized parallel verify with balanced 9 groups
 * Based on actual measurements: celebration(66s), feedback(40s), composer(55s)
 */
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const groups = {
  // 按真实测量时长平衡分组（目标每组 ~80-90s）
  group1: ['test:celebration'],  // 66s 单独
  group2: ['test:composer', 'test:due-dates'],  // 55 + 16 = 71s
  group3: ['test:insight', 'test:feedback'],  // 40 + 40 = 80s
  group4: ['test:sync-security', 'test:sync-replay', 'test:insight-generation'],  // 32 + 30 + 28 = 90s
  group5: ['test:review', 'test:sync-join', 'test:sync-review'],  // 35 + 28 + 25 = 88s
  group6: ['test:sync-scheduling', 'test:recovery', 'test:ordering', 'test:relations'],  // 26 + 25 + 24 + 22 = 97s
  group7: ['test:credentials', 'test:links', 'test:periods', 'test:history'],  // 20 * 4 = 80s
  group8: ['test:language', 'test:ui', 'test:updates', 'test:autosave', 'test:keychain-native'],  // 18 + 17 + 16 + 15 + 15 = 81s
  group9: ['test:later', 'test:columns', 'test:task-focus', 'test:electron'],  // 14 + 13 + 12 + 10 = 49s
}

function run(command, args) {
  return new Promise((resolve) => {
    const start = performance.now()
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    let stdout = '', stderr = ''
    child.stdout.on('data', c => { stdout += c })
    child.stderr.on('data', c => { stderr += c })
    child.on('close', code => {
      resolve({ code, duration: ((performance.now() - start) / 1000).toFixed(1), stdout, stderr })
    })
  })
}

async function runGroup(name, tests) {
  const start = performance.now()
  const results = []
  for (const test of tests) {
    const r = await run('pnpm', ['run', test])
    results.push({ test, ...r })
  }
  return { name, duration: ((performance.now() - start) / 1000).toFixed(1), results }
}

async function main() {
  console.log('🚀 Parallel Verify (Optimized 9 Groups)\n')
  const overallStart = performance.now()
  
  // Phase 1: typecheck + test
  console.log('Phase 1: Quick checks')
  const tc = await run('pnpm', ['typecheck'])
  console.log(`  typecheck: ${tc.duration}s ${tc.code === 0 ? '✓' : '✗'}`)
  if (tc.code !== 0) process.exit(1)
  
  const t = await run('pnpm', ['test'])
  console.log(`  test: ${t.duration}s ${t.code === 0 ? '✓' : '✗'}`)
  if (t.code !== 0) process.exit(1)
  
  // Phase 2: build
  console.log('\nPhase 2: Build')
  const b = await run('pnpm', ['build'])
  console.log(`  build: ${b.duration}s ${b.code === 0 ? '✓' : '✗'}`)
  if (b.code !== 0) process.exit(1)
  
  // Phase 3: E2E parallel
  console.log('\nPhase 3: E2E (9 groups parallel)')
  const e2eStart = performance.now()
  const groupResults = await Promise.all(
    Object.entries(groups).map(([name, tests]) => runGroup(name, tests))
  )
  const e2eDuration = ((performance.now() - e2eStart) / 1000).toFixed(1)
  
  // Report
  console.log(`\nE2E completed in ${e2eDuration}s\n`)
  groupResults.forEach(g => {
    const failed = g.results.filter(r => r.code !== 0)
    const status = failed.length === 0 ? '✓' : `✗ (${failed.length} failed)`
    console.log(`  ${g.name}: ${g.duration}s ${status}`)
  })
  
  const total = ((performance.now() - overallStart) / 1000).toFixed(1)
  const allFailed = groupResults.flatMap(g => g.results).filter(r => r.code !== 0)
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Total: ${total}s`)
  console.log(`Phases: ${tc.duration}s + ${t.duration}s + ${b.duration}s + ${e2eDuration}s`)
  
  if (allFailed.length > 0) {
    console.log(`\n✗ ${allFailed.length} tests failed:`)
    allFailed.forEach(f => console.log(`  - ${f.test}`))
    process.exit(1)
  }
  
  console.log('\n✓ All tests passed!')
  
  // 性能分析
  const serialEstimate = parseFloat(tc.duration) + parseFloat(t.duration) + parseFloat(b.duration) +
    groupResults.reduce((sum, g) => sum + parseFloat(g.duration), 0)
  const saved = serialEstimate - parseFloat(total)
  console.log(`\nSerial estimate: ${serialEstimate.toFixed(1)}s`)
  console.log(`Parallel actual: ${total}s`)
  console.log(`Time saved: ${saved.toFixed(1)}s (${((saved / serialEstimate) * 100).toFixed(1)}%)`)
}

main().catch(e => { console.error('💥', e.message); process.exit(1) })
