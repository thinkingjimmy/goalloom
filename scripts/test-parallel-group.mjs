#!/usr/bin/env node
// 测试单个分组的并行逻辑
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

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
  })
}

async function testGroup() {
  console.log('🧪 Testing parallel group execution')
  console.log('Running 3 fast tests: feedback, celebration, columns\n')
  
  const start = performance.now()
  
  // 串行执行（对照组）
  console.log('📊 Serial execution:')
  const serialStart = performance.now()
  for (const test of ['test:feedback', 'test:celebration', 'test:columns']) {
    const result = await run('pnpm', ['run', test])
    console.log(`  ${test}: ${result.duration}s`)
  }
  const serialTotal = ((performance.now() - serialStart) / 1000).toFixed(1)
  console.log(`Serial total: ${serialTotal}s\n`)
  
  console.log('Test completed! Parallel implementation will be in main script.')
  console.log(`(Note: Node.js child processes already run in parallel by OS)`)
}

testGroup().catch(console.error)
