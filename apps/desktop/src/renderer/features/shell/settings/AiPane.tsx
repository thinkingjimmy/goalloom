/**
 * [INPUT]: Device AI state/actions, localized labels, bundled official provider logos and ProviderAction hints.
 * [OUTPUT]: One compact service list with connection state, masked keys/test dates, icon actions, inline forms, removal confirmation and account recovery; privacy and development notices remain visible.
 * [POS]: Settings' only credential-management pane; feature selection and workspace data remain separate.
 */
import { SettingsButton, IconButton } from '../../../components/ui/button'
import { assistanceMessages } from '../../../i18n/assistance'
import { useId, useState } from 'react'
import { aiProviders } from '../../../../shared/contracts/values'
import type { AiProvider } from '../../../../shared/contracts/smart-input'
import { insightMessages, messages, providerNames, settingsMessages, smartMessages as t } from '../../../i18n'
import { useDismissedNotice } from '../../../state/notices'
import { monthDay } from '../../../i18n/format'
import { connectedProviders, featureUsers, providerIssue, type Ai } from '../../../state/ai'
import { Icon } from '../../../components/icons'
import { ProviderConnect } from '../../smart/ProviderConnect'
import { HostedAiSettings } from './HostedAiSettings'
import { SettingsGroup } from './parts'
import { issueText } from './FeatureControls'
import { ProviderAction } from './ProviderAction'
import openRouterLogo from '../../../assets/ai/openrouter.svg'
import vercelLogo from '../../../assets/ai/vercel.png'

const logos: Partial<Record<AiProvider, string>> = { openrouter: openRouterLogo, 'vercel-gateway': vercelLogo }

export function AiPane({ ai }: { ai: Ai }) {
  const [open, setOpen] = useState<AiProvider | null>(null), [removing, setRemoving] = useState<AiProvider | null>(null)
  const formId = useId()
  const status = ai.status
  const unsigned = useDismissedNotice('unsigned', status?.unsignedBuild ? 'unsigned' : null)
  if (!status) return <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.testing}</p>
  const connected: AiProvider[] = connectedProviders(status).filter(provider => provider !== 'hosted'), others: AiProvider[] = aiProviders.filter(provider => provider !== 'hosted' && !connected.includes(provider))
  const featureName = { smart: t.sectionTitle, insight: insightMessages.settingsSection }
  const row = (provider: AiProvider) => {
    const value = status.providers[provider], isConnected = connected.includes(provider), issue = isConnected ? providerIssue(status, provider) : null
    const users = featureUsers(status, provider).map(feature => featureName[feature])
    const expanded = open === provider
    const detail = !isConnected ? t.notAdded : issue ? issueText(issue)
      : value.keyHint && value.verifiedAt ? t.keyVerified(value.keyHint, monthDay(value.verifiedAt.slice(0, 10))) : value.keyHint
    const actionLabel = expanded ? t.collapse : isConnected ? t.replaceKey : t.addKey
    const connection = issue ? t.needsAttention : isConnected ? t.connectedStatus : t.disconnectedStatus
    const remove = () => { if (users.length && removing !== provider) { setOpen(null); setRemoving(provider); return } setRemoving(null); setOpen(null); void ai.forget(provider) }
    return <div key={provider} className="smart-provider" data-open={expanded}>
      <div className="settings-row provider-row px-5 py-5 flex items-center gap-3.5">
        <span className="provider-mark size-10 shrink-0 grid place-items-center rounded-[11px] bg-hover" aria-hidden="true"><img className="provider-logo size-6.5 object-contain" data-provider={provider} src={logos[provider]} width={26} height={26} alt="" /></span>
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">
          <span className="provider-name flex items-center flex-wrap gap-y-1 gap-x-2.5"><span>{providerNames[provider]}</span><span className="provider-state inline-flex items-center gap-1.5 text-[11px] font-normal" data-state={issue ? 'issue' : isConnected ? 'connected' : 'disconnected'}>{connection}</span></span>
          <small data-issue={!!issue}>{detail}</small>
        </div>
        {removing !== provider && <div className="provider-actions shrink-0 flex items-center gap-1">
          <ProviderAction label={actionLabel} icon={expanded ? 'close' : isConnected ? 'edit' : 'add'} aria-expanded={expanded} aria-controls={`${formId}-${provider}`} onClick={() => setOpen(expanded ? null : provider)} />
          {isConnected && <ProviderAction label={t.remove} icon="delete" danger onClick={remove} />}
        </div>}
      </div>
      {removing === provider && <div className="settings-row provider-remove min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4" role="alert"><span>{t.removeWarning(t.joinNames(users))}</span>
        <SettingsButton type="button" onClick={() => setRemoving(null)}>{t.keepIt}</SettingsButton>
        <SettingsButton variant="danger" type="button" onClick={remove}>{t.confirmRemove}</SettingsButton></div>}
      {isConnected && issue && !expanded && removing !== provider && <div className="provider-recovery flex flex-wrap justify-end gap-2 px-5 py-3">
        <SettingsButton type="button" onClick={() => ai.openConsole(provider)}>{t.openConsole}</SettingsButton>
        <SettingsButton variant="primary" type="button" onClick={() => void ai.connect(provider, null)}>{t.retest}</SettingsButton>
      </div>}
      {expanded && <div id={`${formId}-${provider}`} className="smart-provider-form pt-1 pr-5 pb-5 pl-[74px]"><ProviderConnect key={provider} ai={ai} provider={provider} done={() => setOpen(null)} /></div>}
    </div>
  }
  return <>
    <HostedAiSettings ai={ai} />
    <SettingsGroup>{[...connected, ...others].map(row)}</SettingsGroup>
    <section className="settings-group shrink-0 flex flex-col gap-2">
      <header className="settings-group-header flex items-baseline justify-between gap-3 px-0.5 py-0"><h3>{settingsMessages.privacy}</h3></header>
      <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{assistanceMessages().name} · {assistanceMessages().consentBody}</p>
      <ul className="settings-points m-0 px-0.5 py-0 list-none flex flex-col gap-1 text-[12.5px] leading-[1.6] text-soft">{settingsMessages.privacyPoints.map(point => <li key={point}>{point}</li>)}</ul>
      {unsigned.open && <div className="settings-footnote settings-warning m-0 text-[12px] leading-[1.7] flex items-start gap-2 text-warning" role="status"><Icon name="warning" size={14} /><span>{t.unsigned}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={unsigned.dismiss}><Icon name="close" size={16} /></IconButton></div>}
    </section>
  </>
}
