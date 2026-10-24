/**
 * [INPUT]: Localized questions, rich answer content and a page-specific disclosure group.
 * [OUTPUT]: Native exclusive FAQ disclosures with the first answer open and shared Hugeicons indicators.
 * [POS]: Shared question list for homepage and pricing FAQ layouts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode } from 'react'
import { Icon } from './icons'

export function FaqList({ name, items }: { name: string; items: Array<{ id?: string; question: string; answer: ReactNode }> }) {
  return <div className="faq home-faq-list">
    {items.map((item, index) => <details key={item.id ?? item.question} id={item.id} name={name} open={index === 0}>
      <summary>{item.question}<span className="home-faq-indicator" aria-hidden="true"><span className="when-closed"><Icon name="add" size={18} /></span><span className="when-open"><Icon name="minus" size={18} /></span></span></summary>
      {item.answer}
    </details>)}
  </div>
}
