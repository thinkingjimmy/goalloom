/**
 * [INPUT]: Built main entry, isolated app profile and a private-keychain Node-API probe.
 * [OUTPUT]: Real Electron startup with the production interaction policy and a test-only native probe.
 * [POS]: Native credential E2E entry. It does not set the policy or access a user's saved credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app } from 'electron'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

globalThis.nativeKeychainProbe = createRequire(import.meta.url)(process.env.GOALLOOM_KEYCHAIN_PROBE)
app.setAsDefaultProtocolClient = () => false
await import(pathToFileURL(resolve('out/main/index.js')).href)
