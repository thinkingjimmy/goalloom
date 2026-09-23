import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { isTrustedFrameUrl, localResource, productionCsp } from '../../src/main/security'

it('本地资源拒绝其他域、类型和转义后的越界路径', () => {
  const root = resolve('out/renderer')
  expect(localResource(root, 'goalloom://app/index.html')).toBe(resolve(root, 'index.html'))
  for (const url of ['https://app/index.html', 'goalloom://evil/index.html', 'goalloom://app/%2e%2e%2fsecret.js', 'goalloom://app/%5csecret.js', 'goalloom://app/file.sqlite', 'goalloom://user@app/index.html']) {
    expect(localResource(root, url)).toBeNull()
  }
  expect(productionCsp).toContain("connect-src 'none'")
  expect(productionCsp).toContain("script-src 'self';")
  expect(productionCsp).not.toMatch(/unsafe-eval/)
})

it('IPC 允许同页锚点，但拒绝伪造域与其他文档', () => {
  const expected = 'goalloom://app/index.html'
  expect(isTrustedFrameUrl(`${expected}#main`, expected)).toBe(true)
  expect(isTrustedFrameUrl('goalloom://app.evil/index.html', expected)).toBe(false)
  expect(isTrustedFrameUrl('goalloom://app/other.html', expected)).toBe(false)
  expect(isTrustedFrameUrl(`${expected}?remote=true`, expected)).toBe(false)
})
