/**
 * [INPUT]: Localized label/text, shared Hugeicons and native disclosure dismissal.
 * [OUTPUT]: InfoDisclosure with a keyboard/touch-accessible information trigger and upward text panel.
 * [POS]: Shared inline information control; native disclosure remains available without JavaScript.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
'use client'

import { useId } from 'react'
import { Icon } from './icons'
import { useDismissibleMenu } from './use-dismissible-menu'

export function InfoDisclosure({ label, text }: { label: string; text: string }) {
  const ref = useDismissibleMenu()
  const id = useId()
  return <details ref={ref} className="info-disclosure">
    <summary aria-label={label} aria-controls={id}><Icon name="info" size={16} /></summary>
    <div className="info-panel" id={id}><p>{text}</p></div>
  </details>
}
