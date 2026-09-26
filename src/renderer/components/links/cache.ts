/**
 * [INPUT]: Validated destinations, viewport intersection and the finite preview IPC.
 * [OUTPUT]: Deduplicated visible-only metadata and generation-scoped renderer cache reset.
 * [POS]: Ephemeral presentation cache; no item writes, remote fetches or draft inspection.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { LinkPreview } from '../../../shared/contracts/link-preview'
import { desktopApi } from '../../state/use-workspace'
import { linkSource } from './parse'

const cache = new Map<string, { preview: LinkPreview; expires: number; bytes: number }>()
const pending = new Map<string, Promise<LinkPreview>>()
const maximumBytes = 24 * 1024 * 1024
let cacheBytes = 0
let generation = 0

export function resetLinkPreviewCache(): void {
  generation++
  cache.clear(); pending.clear(); cacheBytes = 0
}

function unavailable(url: string): LinkPreview {
  return { url, status: 'unavailable', title: linkSource(url), siteName: linkSource(url), description: '', image: null }
}

function request(url: string): Promise<LinkPreview> {
  const hit = cache.get(url)
  if (hit && hit.expires > Date.now()) {
    cache.delete(url); cache.set(url, hit)
    return Promise.resolve(hit.preview)
  }
  if (hit) { cacheBytes -= hit.bytes; cache.delete(url) }
  const flight = pending.get(url)
  if (flight) return flight
  const owner = generation
  const promise = Promise.resolve().then(() => desktopApi().getLinkPreview(url)).catch(() => unavailable(url)).then(preview => {
    if (owner !== generation) return unavailable(url)
    const bytes = JSON.stringify(preview).length * 2
    cache.set(url, { preview, bytes, expires: Date.now() + (preview.status === 'ready' ? 300_000 : 60_000) }); cacheBytes += bytes
    while (cache.size > 128 || cacheBytes > maximumBytes) {
      const first = cache.keys().next().value
      if (!first) break
      cacheBytes -= cache.get(first)!.bytes; cache.delete(first)
    }
    return preview
  }).finally(() => { if (pending.get(url) === promise) pending.delete(url) })
  pending.set(url, promise)
  return promise
}

export function useLinkPreview(url: string) {
  const [node, setNode] = useState<HTMLAnchorElement | null>(null)
  const [visible, setVisible] = useState('')
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ url: string; preview: LinkPreview } | null>(null)
  useEffect(() => {
    if (!node) return
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0) ? url : '')
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, url])
  useEffect(() => {
    if (visible !== url) return
    const online = () => {
      const hit = cache.get(url)
      if (hit?.preview.status === 'unavailable') { cacheBytes -= hit.bytes; cache.delete(url) }
      setRetry(value => value + 1)
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [url, visible])
  useEffect(() => {
    if (visible !== url) return
    let active = true
    void request(url).then(preview => { if (active) setResult({ url, preview }) })
    return () => { active = false }
  }, [url, visible, retry])
  return { ref: setNode, preview: result?.url === url ? result.preview : null }
}
