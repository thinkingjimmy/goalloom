/**
 * [INPUT]: Shared update store (app version + updater phase), current locale and the bounded external-link bridge.
 * [OUTPUT]: About pane (A′, left-aligned like other panes): shadow-free app icon, name with a version tag and tagline; one software-update row whose leading
 *           status icon follows the updater phase, with manual check / restart-to-update; website and release-notes links.
 * [POS]: Settings › About; also the target of the macOS app menu's About / Check for Updates items. Holds no state of its own.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
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
    <div className="about-hero">
      {/* The bundled icon carries a macOS drop shadow; the frame crops to the icon body so the page adds only a hairline. */}
      <span className="about-icon"><img src={appIcon} alt="" draggable={false} /></span>
      <div>
        <div className="about-name"><h3>Goalloom</h3>{info && <span className="about-version tabular" title={a.version(info.version)}>{info.version}</span>}</div>
        <p>{a.tagline}</p>
      </div>
    </div>
    {info && phase && <SettingsGroup>
      <div className="settings-row about-update">
        <span className="about-status" data-phase={phase} aria-hidden="true"><span className="about-refresh" data-spinning={phase === 'checking'}><Icon name={phaseIcon[phase]} size={14} strokeWidth={2} /></span></span>
        <div className="settings-row-text"><span>{a.updates}</span><small role="status" data-phase={phase}>{status(info)}</small></div>
        {phase === 'ready'
          ? <button type="button" className="settings-button primary" onClick={installUpdate}>{a.restart}</button>
          : phase !== 'unsupported' && <button type="button" className="settings-button" disabled={phase === 'checking' || phase === 'downloading'} onClick={checkForUpdate}>{a.check}</button>}
      </div>
    </SettingsGroup>}
    <p className="about-links">
      <button type="button" className="settings-button link" onClick={() => open(websiteUrl)}>{a.website} <span className="about-external"><Icon name="forward" size={12} /></span></button>
      <button type="button" className="settings-button link" onClick={() => open(releasesUrl)}>{a.releaseNotes} <span className="about-external"><Icon name="forward" size={12} /></span></button>
    </p>
  </>
}
