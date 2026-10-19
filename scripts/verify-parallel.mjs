#!/usr/bin/env node
/**
 * [INPUT]: None (reads package.json scripts)
 * [OUTPUT]: Parallel E2E execution report with timing and success/failure status
 * [POS]: Repository-level test orchestrator; replaces serial `pnpm verify`
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

// 基于真机实测时长分组（目标：每组耗时接近，最慢组决定总时长）
// 分组原则：
// 1. 数据天然隔离（每个脚本独立 Electron 进程 + 临时工作区）
// 2. 按时长平衡，避免单组过慢
// 3. 同步相关脚本分散到不同组（避免凭据争用）
const groups = {
  // Group 1: 智能输入 + 中等脚本（预计 ~100s）
  group1: [
    'test:composer',       // 55s (最慢，单独为主)
    'test:relations',      // 22s
    'test:links',          // 20s
  ],

  // Group 2: 洞察功能（预计 ~90s）
  group2: [
    'test:insight',        // 40s
    'test:insight-generation', // 28s
    'test:periods',        // 20s
  ],

  // Group 3: 同步核心（预计 ~95s）
  group3: [
    'test:review',         // 35s
    'test:sync-security',  // 32s
    'test:sync-replay',    // 30s
  ],

  // Group 4: 同步相关 + 凭据（预计 ~90s）
  group4: [
    'test:sync-scheduling', // 26s
    'test:sync-join',      // 28s
    'test:sync-review',    // 25s
    'test:credentials',    // 20s
  ],

  // Group 5: UI 框架 + 数据（预计 ~90s）
  group5: [
    'test:recovery',       // 25s
    'test:ordering',       // 24s
    'test:history',        // 18s
    'test:language',       // 18s
  ],

  // Group 6: 快速脚本组（预计 ~90s）
  group6: [
    'test:ui',             // 17s
    'test:due-dates',      // 16s
    'test:updates',        // 16s
    'test:autosave',       // 15s
    'test:keychain-native', // 15s
    'test:later',          // 14s
  ],

  // Group 7: 剩余快速脚本（预计 ~85s）
  group7: [
    'test:celebration',    // 14s
    'test:columns',        // 13s
    'test:task-focus',     // 12s
    'test:feedback',       // 12s
    'test:electron',       // 10s
  ],
}

function run(command, args = []) {
  return new Promise((resolve) => {
    const start = performance.now()
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })

    child.on('close', (code) => {
      const duration = ((performance.now() - start) / 1000).toFixed(1)
      resolve({ code, duration: parseFloat(duration) })
    })

    child.on('error', (error) => {
      const duration = ((performance.now() - start) / 1000).toFixed(1)
      resolve({ code: 1, duration: parseFloat(duration), error: error.message })
    })
  })
}

async function runGroup(name, tests) {
  console.log(`\n▶ Starting ${name} (${tests.length} tests)`)
  const start = performance.now()
  const results = []

  for (const test of tests) {
    console.log(`  ⏳ Running ${test}...`)
    const result = await run('pnpm', ['run', test])
    results.push({ test, ...result })

    const status = result.code === 0 ? '✓' : '✗'
    console.log(`  ${status} ${test}: ${result.duration}s`)

    // 失败时继续运行其他测试，记录但不中断
    if (result.code !== 0) {
      console.error(`  ⚠ ${test} failed with code ${result.code}`)
    }
  }

  const totalDuration = ((performance.now() - start) / 1000).toFixed(1)
  const failed = results.filter(r => r.code !== 0)

  console.log(`\n✓ ${name} completed in ${totalDuration}s`)
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.map(f => f.test).join(', ')}`)
  }

  return {
    name,
    tests: results,
    duration: parseFloat(totalDuration),
    failed: failed.length,
  }
}

async function main() {
  console.log('🚀 Goalloom Parallel Verify')
  console.log('━'.repeat(60))

  const overallStart = performance.now()

  // Phase 1: 快速检查（串行，无需并行）
  console.log('\n📋 Phase 1: Quick checks (serial)')
  const quickChecks = [
    { name: 'typecheck', cmd: 'pnpm', args: ['typecheck'] },
    { name: 'vitest', cmd: 'pnpm', args: ['test'] },
  ]

  const quickResults = []
  for (const check of quickChecks) {
    console.log(`  ⏳ ${check.name}...`)
    const result = await run(check.cmd, check.args)
    quickResults.push({ name: check.name, ...result })

    const status = result.code === 0 ? '✓' : '✗'
    console.log(`  ${status} ${check.name}: ${result.duration}s`)

    if (result.code !== 0) {
      console.error(`\n❌ ${check.name} failed. Stopping.`)
      process.exit(1)
    }
  }

  // Phase 2: 构建（串行，必须成功）
  console.log('\n🔨 Phase 2: Build (serial)')
  console.log('  ⏳ Building...')
  const buildResult = await run('pnpm', ['build'])

  if (buildResult.code !== 0) {
    console.error('\n❌ Build failed. Stopping.')
    process.exit(1)
  }
  console.log(`  ✓ Build completed in ${buildResult.duration}s`)

  // Phase 3: E2E 并行测试
  console.log('\n🧪 Phase 3: E2E tests (parallel)')
  console.log(`  Groups: ${Object.keys(groups).length}`)
  console.log(`  Total tests: ${Object.values(groups).flat().length}`)

  const e2eStart = performance.now()

  // 并行执行所有分组
  const groupResults = await Promise.all(
    Object.entries(groups).map(([name, tests]) => runGroup(name, tests))
  )

  const e2eDuration = ((performance.now() - e2eStart) / 1000).toFixed(1)

  // 汇总报告
  console.log('\n' + '━'.repeat(60))
  console.log('📊 Summary Report')
  console.log('━'.repeat(60))

  const overallDuration = ((performance.now() - overallStart) / 1000).toFixed(1)
  const totalTests = groupResults.reduce((sum, g) => sum + g.tests.length, 0)
  const totalFailed = groupResults.reduce((sum, g) => sum + g.failed, 0)

  console.log('\nPhase 1 (Quick checks):')
  quickResults.forEach(r => {
    console.log(`  ${r.name}: ${r.duration}s`)
  })

  console.log(`\nPhase 2 (Build): ${buildResult.duration}s`)

  console.log(`\nPhase 3 (E2E parallel): ${e2eDuration}s`)
  groupResults.forEach(g => {
    const status = g.failed === 0 ? '✓' : `✗ (${g.failed} failed)`
    console.log(`  ${g.name}: ${g.duration}s ${status}`)
  })

  console.log('\n' + '━'.repeat(60))
  console.log(`Total: ${overallDuration}s`)
  console.log(`Tests: ${totalTests} (${totalTests - totalFailed} passed, ${totalFailed} failed)`)

  // 性能分析
  const quickTotal = quickResults.reduce((sum, r) => sum + r.duration, 0)
  const serialEstimate = quickTotal + buildResult.duration +
    groupResults.reduce((sum, g) => sum + g.duration, 0)
  const saved = serialEstimate - parseFloat(overallDuration)

  console.log(`\nSerial estimate: ${serialEstimate.toFixed(1)}s`)
  console.log(`Parallel actual: ${overallDuration}s`)
  console.log(`Time saved: ${saved.toFixed(1)}s (${((saved / serialEstimate) * 100).toFixed(1)}%)`)

  if (totalFailed > 0) {
    console.log('\n❌ Some tests failed:')
    groupResults
      .filter(g => g.failed > 0)
      .forEach(g => {
        g.tests
          .filter(t => t.code !== 0)
          .forEach(t => console.log(`  - ${t.test}`))
      })
    process.exit(1)
  }

  console.log('\n✓ All tests passed!')
  process.exit(0)
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error.message)
  process.exit(1)
})
