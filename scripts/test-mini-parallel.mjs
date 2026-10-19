#!/usr/bin/env node
// 小规模测试：2 组并行，验证逻辑
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

function run(command, args = []) {
  return new Promise((resolve) => {
    const start = performance.now()
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: process.env,
    })
    
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    
    child.on('close', (code) => {
      const duration = ((performance.now() - start) / 1000).toFixed(1)
      resolve({ code, duration: parseFloat(duration), stdout, stderr })
    })
  })
}

async function runGroup(name, tests) {
  console.log(`\n▶ ${name}: ${tests.join(', ')}`)
  const start = performance.now()
  const results = []
  
  for (const test of tests) {
    const result = await run('pnpm', ['run', test])
    results.push({ test, ...result })
    
    const status = result.code === 0 ? '✓' : '✗'
    console.log(`  ${status} ${test}: ${result.duration}s`)
  }
  
  const duration = ((performance.now() - start) / 1000).toFixed(1)
  console.log(`✓ ${name} done: ${duration}s total`)
  
  return { name, duration: parseFloat(duration), results }
}

async function main() {
  console.log('🧪 Mini Parallel Test (2 groups)')
  console.log('━'.repeat(50))
  
  const start = performance.now()
  
  // 2 组并行
  const [g1, g2] = await Promise.all([
    runGroup('Group A', ['test:feedback', 'test:celebration']),
    runGroup('Group B', ['test:columns', 'test:electron']),
  ])
  
  const total = ((performance.now() - start) / 1000).toFixed(1)
  
  console.log('\n━'.repeat(50))
  console.log(`Parallel total: ${total}s`)
  console.log(`Group A: ${g1.duration}s`)
  console.log(`Group B: ${g2.duration}s`)
  console.log(`Expected: ~max(${g1.duration}, ${g2.duration}) ≈ ${Math.max(g1.duration, g2.duration)}s`)
  console.log(`Overhead: ${(total - Math.max(g1.duration, g2.duration)).toFixed(1)}s`)
  
  const allPassed = [...g1.results, ...g2.results].every(r => r.code === 0)
  console.log(allPassed ? '\n✓ All passed!' : '\n✗ Some failed')
  
  process.exit(allPassed ? 0 : 1)
}

main().catch(error => {
  console.error('💥', error.message)
  process.exit(1)
})
