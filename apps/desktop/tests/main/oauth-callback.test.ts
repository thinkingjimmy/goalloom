import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { expect, it } from 'vitest'
import { signedInUrl } from '../../src/main/protocol'
import { callbackCsp, callbackLinks, callbackPage } from '../../src/main/sync/callback-page'
import { googleSignIn, oauthTimeoutMs } from '../../src/main/sync/oauth'

const session = { access_token: 'token', refresh_token: 'refresh', user: { email: 'jimmy@example.com' } } as Session
const allowed = new Set<string>(Object.values(callbackLinks))

function client(exchange: (code: string) => Promise<{ session: Session | null; message?: string }>): SupabaseClient {
  return {
    auth: {
      signInWithOAuth: async () => ({ data: { url: 'https://accounts.example/oauth' }, error: null }),
      exchangeCodeForSession: async (code: string) => {
        const result = await exchange(code)
        return { data: { session: result.session }, error: result.message ? { message: result.message } : null }
      },
    },
  } as unknown as SupabaseClient
}

async function start(exchange: (code: string) => Promise<{ session: Session | null; message?: string }>, timeoutMs = 5_000, onCallback?: () => void) {
  let port = 0
  const done = googleSignIn(client(exchange), async () => {}, { port: 0, timeoutMs, onReady: value => { port = value }, ...(onCallback ? { onCallback } : {}) })
  void done.then(() => undefined, () => undefined)
  const deadline = Date.now() + 2_000
  while (port === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  if (!port) throw new Error('callback server did not listen')
  return { port, done }
}

it('回调页自包含，成功和失败都有中英正文，链接是绝对地址', () => {
  const ok = callbackPage(false)
  const failed = callbackPage(true)
  expect(oauthTimeoutMs).toBe(180_000)
  expect(ok).toContain('已登录，可以关闭此页面')
  expect(ok).toContain('Signed in. You can close this tab.')
  expect(ok).toContain('class="site-header float-bar"')
  expect(ok).toContain('site-footer')
  expect(ok).toContain('目标看板')
  expect(ok).toContain('打开 Goalloom')
  expect(ok).toContain(`href="${signedInUrl}"`)
  expect(ok).toContain(`location.href=${JSON.stringify(signedInUrl)}`)
  expect(ok).not.toContain('class="error"')
  expect(failed).toContain('class="error"')
  expect(failed).toContain('class="site-header float-bar"')
  expect(failed).toContain('site-footer')
  expect(failed).toContain('登录未完成')
  expect(failed).toContain('Sign-in didn\'t finish. Please try again in the app.')
  expect(failed).not.toContain('打开 Goalloom')
  expect(failed).not.toContain('location.href')
  for (const page of [ok, failed]) {
    expect(page).not.toMatch(/<script[^>]+src=/i)
    expect(page).not.toMatch(/<link\b/i)
    expect(page).not.toMatch(/url\s*\(/i)
    expect(page).not.toMatch(/@import/i)
    expect(page).toContain('prefers-color-scheme')
    const urls = [...page.matchAll(/https?:\/\/[^"'\s)]+/g)].map(match => match[0])
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every(url => allowed.has(url))).toBe(true)
  }
})

it('交换完成之前不返回页面，成功后才是登录完成', async () => {
  let started = false
  let callbacks = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const { port, done } = await start(async () => { started = true; await gate; return { session } }, 5_000, () => { callbacks += 1 })
  const pending = fetch(`http://127.0.0.1:${port}/callback?code=ok`)
  const deadline = Date.now() + 1_000
  while (!started && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  expect(started).toBe(true)
  let settled = false
  void done.then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(settled).toBe(false)
  release()
  const response = await pending
  expect(response.status).toBe(200)
  expect(response.headers.get('content-security-policy')).toBe(callbackCsp)
  const body = await response.text()
  expect(body).toContain('已登录，可以关闭此页面')
  expect(body).toContain('class="site-header float-bar"')
  expect(body).toContain('site-footer')
  expect(body).toContain('打开 Goalloom')
  expect(callbacks).toBe(1)
  await expect(done).resolves.toBe(session)
})

it('提供方错误或缺少 code 时直接显示失败页，并且不交换', async () => {
  let calls = 0
  let callbacks = 0
  const { port, done } = await start(async () => { calls += 1; return { session } }, 5_000, () => { callbacks += 1 })
  const response = await fetch(`http://127.0.0.1:${port}/callback?error=access_denied`)
  const body = await response.text()
  expect(body).toContain('class="error"')
  expect(body).toContain('site-header')
  expect(body).not.toContain('打开 Goalloom')
  expect(body).not.toContain('location.href')
  expect(calls).toBe(0)
  expect(callbacks).toBe(1)
  await expect(done).rejects.toMatchObject({ code: 'auth', message: 'access_denied' })
})

it('没有 code 时失败页说明登录未完成', async () => {
  const { port, done } = await start(async () => ({ session }))
  const response = await fetch(`http://127.0.0.1:${port}/callback`)
  expect(await response.text()).toContain('登录未完成')
  await expect(done).rejects.toMatchObject({ code: 'auth', message: 'missing code' })
})

it('交换失败时页面是失败状态', async () => {
  const { port, done } = await start(async () => ({ session: null, message: 'invalid code' }))
  const response = await fetch(`http://127.0.0.1:${port}/callback?code=bad`)
  expect(await response.text()).toContain('class="error"')
  await expect(done).rejects.toMatchObject({ code: 'auth', message: 'invalid code' })
})

it('其它路径返回 404，不结束这次登录', async () => {
  let callbacks = 0
  const { port, done } = await start(async () => ({ session }), 5_000, () => { callbacks += 1 })
  expect((await fetch(`http://127.0.0.1:${port}/elsewhere`)).status).toBe(404)
  expect(callbacks).toBe(0)
  const response = await fetch(`http://127.0.0.1:${port}/callback?code=ok`)
  expect(await response.text()).toContain('已登录，可以关闭此页面')
  expect(callbacks).toBe(1)
  await expect(done).resolves.toBe(session)
})

it('一次登录只接受一个回调', async () => {
  let calls = 0
  const { port, done } = await start(async () => {
    calls += 1
    await new Promise(resolve => setTimeout(resolve, 40))
    return { session }
  })
  const first = fetch(`http://127.0.0.1:${port}/callback?code=one`)
  const deadline = Date.now() + 1_000
  while (calls === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  const second = await fetch(`http://127.0.0.1:${port}/callback?code=two`)
  expect(second.status).toBe(409)
  expect(calls).toBe(1)
  expect(await (await first).text()).toContain('已登录，可以关闭此页面')
  await expect(done).resolves.toBe(session)
})

it('三分钟内没有回调就超时，测试用更短的时限', async () => {
  await expect(googleSignIn(client(async () => ({ session })), async () => {}, { port: 0, timeoutMs: 30 })).rejects.toMatchObject({ code: 'auth', message: 'timeout' })
})
