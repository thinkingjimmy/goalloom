/**
 * [INPUT]: An explicit mobile build target and ignored per-environment configuration.
 * [OUTPUT]: SDK 57 native capabilities and one validated Supabase/Google configuration.
 * [POS]: Build-time mobile boundary. Signing secrets are never read or packaged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseEnv } = require('node:util')
const base = require('./app.json').expo
const target = process.env.GOALLOOM_MOBILE_ENV || 'development'
if (!['development', 'production'].includes(target)) throw Error('Unknown mobile environment')
const read = name => {
  try { return parseEnv(readFileSync(resolve(__dirname, '../..', name), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error }
}
const env = { ...read(`.env.sync.${target}.local`), ...read(`.env.mobile.${target}.local`) }
const expected = target === 'production' ? 'keqprrgvcefqdwnxaafv' : 'asqyvcnxdltzzfutbbqy'
const url = env.GOALLOOM_SUPABASE_URL || ''
const anonKey = env.GOALLOOM_SUPABASE_ANON_KEY || ''
if (url || anonKey) {
  if (url !== `https://${expected}.supabase.co` || !anonKey) throw Error('Mobile Supabase environment mismatch')
  const claims = JSON.parse(Buffer.from(anonKey.split('.')[1] || '', 'base64url').toString())
  if (claims.ref !== expected || claims.role !== 'anon') throw Error('Expected the matching anon-role JWT')
}
const iosClientId = env.GOALLOOM_GOOGLE_IOS_CLIENT_ID || ''
const webClientId = env.GOALLOOM_GOOGLE_WEB_CLIENT_ID || ''
for (const id of [iosClientId, webClientId]) if (id && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) throw Error('Invalid Google client ID')
if (target === 'production' && (!url || !iosClientId || !webClientId)) throw Error('Production requires Supabase and Google iOS/web client IDs')
if (target === 'production' && process.env.GOALLOOM_MOBILE_E2E) throw Error('E2E instrumentation cannot enter production')
const iosUrlScheme = iosClientId ? iosClientId.split('.').reverse().join('.') : ''
module.exports = {
  ...base,
  ios: { ...base.ios, usesAppleSignIn: true, ...(process.env.GOALLOOM_MOBILE_E2E === '1' ? { infoPlist: { ...base.ios.infoPlist, NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } } : {}) },
  plugins: [...base.plugins, 'expo-apple-authentication', ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }]] : [])],
  extra: { auth: { target, url, anonKey, iosClientId, webClientId } },
}
