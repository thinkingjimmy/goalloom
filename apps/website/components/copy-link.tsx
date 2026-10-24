'use client'
/**
 * [INPUT]: Depends on react
 * [OUTPUT]: Exports CopyLink
 * [POS]: Shared phone-only fallback inside the Header download menu; copies the desktop release page.
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
