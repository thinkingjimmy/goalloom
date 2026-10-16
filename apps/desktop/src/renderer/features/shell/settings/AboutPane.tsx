/**
 * [INPUT]: Shared update store (app version + updater phase), current locale and the bounded external-link bridge.
 * [OUTPUT]: About pane (A′, left-aligned like other panes): shadow-free app icon, name with a version tag and tagline; one software-update row whose leading
 *           status icon follows the updater phase, with manual check / restart-to-update; website and release-notes links.
 * [POS]: Settings › About; also the target of the macOS app menu's About / Check for Updates items. Holds no state of its own.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SettingsButton } from '../../../components/ui/button'
import { intlTags } from '../../../../shared/i18n/locale'
import type { UpdateInfo } from '../../../../shared/contracts/update'
import { currentLocale, settingsMessages as s } from '../../../i18n'
import { Icon } from '../../../components/icons'
import type { IconName } from '../../../components/icons'
import { checkForUpdate, installUpdate } from '../../../state/update'
import { desktopApi } from '../../../state/use-workspace'
import { SettingsGroup } from './parts'
import appIcon from '../../../assets/app-icon.png'

const websiteUrl = 'https://www.goalloom.com'
const releasesUrl = 'https://github.com/thinkingjimmy/goalloom/releases'

const phaseIcon: Record<UpdateInfo['state']['phase'], IconName> = {
  unsupported: 'info', idle: 'refresh', checking: 'refresh', latest: 'check', downloading: 'download', ready: 'download', failed: 'warning',
}

function status(info: UpdateInfo): string {
  const a = s.about, state = info.state
  switch (state.phase) {
    case 'unsupported': return a.unsupported
    case 'idle': return a.idle
    case 'checking': return a.checking
    case 'latest': return a.latest(new Intl.DateTimeFormat(intlTags[currentLocale()], { hour: '2-digit', minute: '2-digit' }).format(new Date(state.checkedAt)))
    case 'downloading': return a.downloading(state.version, state.percent)
    case 'ready': return a.ready(state.version)
    case 'failed': return a.failed
  }
}

export function AboutPane({ info }: { info: UpdateInfo | null }) {
  const a = s.about, phase = info?.state.phase
  const open = (url: string) => { void desktopApi().openExternal(url).catch(() => false) }
  return <>
    <div className="about-hero flex items-center gap-4 pt-1 pr-0.5 pb-1.5 pl-0.5">
      {/* The bundled icon carries a macOS drop shadow; the frame crops to the icon body so the page adds only a hairline. */}
      <span className="about-icon relative w-16 h-16 shrink-0 rounded-[14px] overflow-hidden"><img src={appIcon} alt="" draggable={false} /></span>
      <div>
        <div className="about-name flex items-center gap-2"><h3>Goalloom</h3>{info && <span className="about-version tabular h-5 px-2 py-0 inline-flex items-center rounded-[10px] bg-hover text-[11.5px] text-muted-foreground" title={a.version(info.version)}>{info.version}</span>}</div>
        <p>{a.tagline}</p>
      </div>
    </div>
    {info && phase && <SettingsGroup>
      <div className="settings-row about-update min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-3">
        <span className="about-status w-7 h-7 shrink-0 grid place-items-center rounded-[8px] bg-hover text-muted-foreground" data-phase={phase} aria-hidden="true"><span className="about-refresh inline-grid place-items-center" data-spinning={phase === 'checking'}><Icon name={phaseIcon[phase]} size={14} strokeWidth={2} /></span></span>
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{a.updates}</span><small role="status" data-phase={phase}>{status(info)}</small></div>
        {phase === 'ready'
          ? <SettingsButton variant="primary" type="button" onClick={installUpdate}>{a.restart}</SettingsButton>
          : phase !== 'unsupported' && <SettingsButton type="button" disabled={phase === 'checking' || phase === 'downloading'} onClick={checkForUpdate}>{a.check}</SettingsButton>}
      </div>
    </SettingsGroup>}
    <p className="about-links m-0 flex gap-1 ml-[-10px]">
      <SettingsButton variant="link" type="button" onClick={() => open(websiteUrl)}>{a.website} <span className="about-external inline-flex"><Icon name="forward" size={12} /></span></SettingsButton>
      <SettingsButton variant="link" type="button" onClick={() => open(releasesUrl)}>{a.releaseNotes} <span className="about-external inline-flex"><Icon name="forward" size={12} /></span></SettingsButton>
    </p>
  </>
}
