/**
 * [INPUT]: Validated destinations, viewport intersection and the finite preview IPC.
 * [OUTPUT]: Synchronous cached presentation, visible-only refresh and generation-scoped cache reset.
 * [POS]: Ephemeral presentation cache; no item writes, remote fetches or draft inspection.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LinkPreview } from '../../../shared/contracts/link-preview'
import { desktopApi } from '../../state/use-workspace'
import { linkSource } from './parse'

const cache = new Map<string, { preview: LinkPreview; expires: number; bytes: number }>()
const pending = new Map<string, Promise<LinkPreview>>()
const maximumBytes = 24 * 1024 * 1024
let cacheBytes = 0
let generation = 0
const generationListeners = new Set<() => void>()
const subscribeGeneration = (listener: () => void) => {
  generationListeners.add(listener)
  return () => { generationListeners.delete(listener) }
}
const currentGeneration = () => generation

export function resetLinkPreviewCache(): void {
  generation++
  cache.clear(); pending.clear(); cacheBytes = 0
  generationListeners.forEach(listener => listener())
}

function cachedPreview(url: string): LinkPreview | null {
  const hit = cache.get(url)
  return hit && (hit.preview.status === 'ready' || hit.expires > Date.now()) ? hit.preview : null
}

function unavailable(url: string): LinkPreview {
  return { url, status: 'unavailable', title: linkSource(url), siteName: linkSource(url), description: '', image: null, favicon: null }
}

function request(url: string): Promise<LinkPreview> {
  const hit = cache.get(url)
  if (hit && hit.expires > Date.now()) {
    cache.delete(url); cache.set(url, hit)
    return Promise.resolve(hit.preview)
  }
  // Keep successful content visible while an expired entry is revalidated.
  if (hit?.preview.status === 'unavailable') { cacheBytes -= hit.bytes; cache.delete(url) }
  const flight = pending.get(url)
  if (flight) return flight
  const owner = generation
  const promise = Promise.resolve().then(() => desktopApi().getLinkPreview(url)).catch(() => unavailable(url)).then(preview => {
    if (owner !== generation) return unavailable(url)
    const previous = cache.get(url)
    const value = preview.status === 'unavailable' && previous?.preview.status === 'ready' ? previous.preview : preview
    const bytes = JSON.stringify(value).length * 2
    if (previous) { cacheBytes -= previous.bytes; cache.delete(url) }
    cache.set(url, { preview: value, bytes, expires: Date.now() + (preview.status === 'ready' ? 300_000 : 60_000) }); cacheBytes += bytes
    while (cache.size > 128 || cacheBytes > maximumBytes) {
      const first = cache.keys().next().value
      if (!first) break
      cacheBytes -= cache.get(first)!.bytes; cache.delete(first)
    }
    return value
  }).finally(() => { if (pending.get(url) === promise) pending.delete(url) })
  pending.set(url, promise)
  return promise
}

export function useLinkPreview(url: string, enabled = true) {
  const owner = useSyncExternalStore(subscribeGeneration, currentGeneration)
  const [node, setNode] = useState<HTMLAnchorElement | null>(null)
  const [visible, setVisible] = useState('')
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ url: string; preview: LinkPreview; generation: number } | null>(null)
  useEffect(() => {
    if (!node || !enabled) return
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0) ? url : '')
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, url, enabled])
  useEffect(() => {
    if (!enabled || visible !== url) return
    const online = () => {
      const hit = cache.get(url)
      if (hit?.preview.status === 'unavailable') { cacheBytes -= hit.bytes; cache.delete(url) }
      setRetry(value => value + 1)
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [url, visible, enabled])
  useEffect(() => {
    if (!enabled || visible !== url) return
    let active = true
    void request(url).then(preview => { if (active) setResult({ url, preview, generation: owner }) })
    return () => { active = false }
  }, [url, visible, retry, owner, enabled])
  return { ref: setNode, preview: cachedPreview(url) ?? (result?.url === url && result.generation === owner ? result.preview : null) }
}
