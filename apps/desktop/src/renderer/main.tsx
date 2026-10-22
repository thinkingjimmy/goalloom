/**
 * [INPUT]: The application root and device language/placement initialization.
 * [OUTPUT]: React mounts after preference hydration, before the first workspace snapshot.
 * [POS]: Renderer bootstrap; migrated placement preferences reach main before startup reconciliation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startLanguage } from './state/language'
import { startParentOrder } from './state/parent-order'
import './styles.css'

void Promise.all([startLanguage(), startParentOrder()]).finally(() => createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>))
