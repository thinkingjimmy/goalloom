/**
 * [INPUT]: macOS Xcode command-line tools, official Node-API headers and native/keychain-policy.c.
 * [OUTPUT]: Vite plugin that emits the compiled Keychain interaction policy beside the main entry.
 * [POS]: Build-only native compilation; no runtime downloads, Electron ABI rebuild or user credential access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export function keychainPolicy(): Plugin {
  const headers = createRequire(import.meta.url)('node-api-headers') as { include_dir: string }
  const source = fileURLToPath(new URL('../../native/keychain-policy.c', import.meta.url))
  return {
    name: 'noninteractive-keychain-policy',
    buildStart() {
      if (process.platform !== 'darwin') return
      this.addWatchFile(source)
      const temporary = mkdtempSync(join(tmpdir(), 'goalloom-keychain-build-'))
      try {
        const binary = join(temporary, 'keychain-policy.node')
        execFileSync('/usr/bin/xcrun', ['clang', '-O2', '-Werror', '-Wno-deprecated-declarations', '-mmacosx-version-min=14.0', '-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64', '-DNAPI_VERSION=8', '-I', headers.include_dir, '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Security', source, '-o', binary], { stdio: 'pipe', timeout: 30_000 })
        this.emitFile({ type: 'asset', fileName: 'keychain-policy.node', source: readFileSync(binary) })
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    },
  }
}
