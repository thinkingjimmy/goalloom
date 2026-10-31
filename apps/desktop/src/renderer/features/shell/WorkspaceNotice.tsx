/**
 * [INPUT]: Complete notice copy, severity and optional action/dismiss callbacks.
 * [OUTPUT]: A persistent, accessible, content-sized Sonner notification with owner-controlled actions and dismissal.
 * [POS]: Shared presentation for workspace errors and system/sync notices; owners retain recovery and dismissal rules.
 */
import { type ReactNode } from 'react'
import { Icon } from '../../components/icons'
import { Button, IconButton } from '../../components/ui/button'
import { FeedbackNotification } from './FeedbackStack'
import './workspace-notice.css'

interface WorkspaceNoticeProps {
  children: ReactNode
  severity?: 'error' | 'notice'
  className?: string
  action?: { label: string; onClick: () => void; disabled?: boolean; checking?: boolean } | undefined
  dismiss?: { label: string; onClick: () => void } | undefined
}

export function WorkspaceNotice({ children, severity = 'notice', className = '', action, dismiss }: WorkspaceNoticeProps) {
  return <FeedbackNotification><section className={`workspace-notice feedback-surface ${severity === 'error' ? 'error-banner' : 'notice-banner'} ${className}`} data-severity={severity}>
    <div className="workspace-notice-content">
      <span className="workspace-notice-icon"><Icon name={severity === 'error' ? 'warning' : 'info'} size={18} /></span>
      <div className="workspace-notice-copy" role={severity === 'error' ? 'alert' : 'status'}>{children}</div>
    </div>
    {action && <div className="workspace-notice-actions"><Button variant="unstyled" className="workspace-notice-action feedback-action" disabled={action.disabled} aria-busy={action.checking} onClick={action.onClick}>
      {action.label}
    </Button></div>}
    {dismiss && <IconButton className="workspace-notice-dismiss" size="small" aria-label={dismiss.label} onClick={dismiss.onClick}><Icon name="close" size={14} /></IconButton>}
  </section></FeedbackNotification>
}
