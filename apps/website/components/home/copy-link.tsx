'use client'
/**
 * [INPUT]: Depends on react
 * [OUTPUT]: Exports CopyLink
 * [POS]: components/home's phone-only download fallback: the app is desktop-only, so a phone visitor copies the link
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'

export function CopyLink({ href, label, done }: { href: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(href); setCopied(true) } catch { location.href = href }
  }
  return <button type="button" className="dl-copy" onClick={copy} aria-live="polite">{copied ? done : label}</button>
}
