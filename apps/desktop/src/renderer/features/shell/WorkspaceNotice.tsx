/**
 * [INPUT]: Complete notice copy, severity and optional action/dismiss callbacks.
 * [OUTPUT]: A persistent, accessible notice card with a trailing primary action and no collapsed state.
 * [POS]: Shared presentation for workspace errors and system/sync notices; owners retain recovery and dismissal rules.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { type ReactNode } from 'react'
import { Icon } from '../../components/icons'
import { IconButton, SettingsButton } from '../../components/ui/button'
import './workspace-notice.css'

interface WorkspaceNoticeProps {
  children: ReactNode
  severity?: 'error' | 'notice'
  className?: string
  action?: { label: string; onClick: () => void; disabled?: boolean; checking?: boolean } | undefined
  dismiss?: { label: string; onClick: () => void } | undefined
}

export function WorkspaceNotice({ children, severity = 'notice', className = '', action, dismiss }: WorkspaceNoticeProps) {
  return <section className={`workspace-notice ${severity === 'error' ? 'error-banner' : 'notice-banner'} ${className}`} data-severity={severity}>
    <div className="workspace-notice-content">
      <span className="workspace-notice-icon"><Icon name={severity === 'error' ? 'warning' : 'info'} size={18} /></span>
      <div className="workspace-notice-copy" role={severity === 'error' ? 'alert' : 'status'}>{children}</div>
      {dismiss && <IconButton className="workspace-notice-dismiss" size="small" aria-label={dismiss.label} onClick={dismiss.onClick}><Icon name="close" size={14} /></IconButton>}
    </div>
    {action && <div className="workspace-notice-actions"><SettingsButton variant="primary" className="workspace-notice-action" disabled={action.disabled} aria-busy={action.checking} onClick={action.onClick}>
      {action.label}
    </SettingsButton></div>}
  </section>
}
