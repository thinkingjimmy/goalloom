/**
 * [INPUT]: Shared update store (app version + updater phase), current locale and the bounded external-link bridge.
 * [OUTPUT]: About pane: app icon, name, tagline and real version; software-update row with manual check / restart-to-update; website and release-notes links.
 * [POS]: Settings › About; also the target of the macOS app menu's About / Check for Updates items. Holds no state of its own.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { intlTags } from '../../../../shared/i18n/locale'
import type { UpdateInfo } from '../../../../shared/contracts/update'
import { currentLocale, settingsMessages as s } from '../../../i18n'
import { Icon } from '../../../components/icons'
import { checkForUpdate, installUpdate } from '../../../state/update'
import { desktopApi } from '../../../state/use-workspace'
import { SettingsGroup, SettingsRow } from './parts'
import appIcon from '../../../assets/app-icon.png'

const websiteUrl = 'https://www.goalloom.com'
const releasesUrl = 'https://github.com/thinkingjimmy/goalloom/releases'

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
      <img src={appIcon} alt="" width={72} height={72} draggable={false} />
      <div>
        <h3>Goalloom</h3>
        <p>{a.tagline}</p>
        {info && <p className="about-version tabular">{a.version(info.version)}</p>}
      </div>
    </div>
    {info && <SettingsGroup>
      <SettingsRow title={a.updates} note={<span role="status" data-phase={phase}>{status(info)}</span>}>
        {phase === 'ready'
          ? <button type="button" className="settings-button primary" onClick={installUpdate}>{a.restart}</button>
          : phase !== 'unsupported' && <button type="button" className="settings-button" disabled={phase === 'checking' || phase === 'downloading'} onClick={checkForUpdate}>
            <span className="about-refresh" data-spinning={phase === 'checking'}><Icon name="refresh" size={14} /></span>{a.check}
          </button>}
      </SettingsRow>
    </SettingsGroup>}
    <p className="about-links">
      <button type="button" className="settings-button link" onClick={() => open(websiteUrl)}>{a.website}</button>
      <button type="button" className="settings-button link" onClick={() => open(releasesUrl)}>{a.releaseNotes}</button>
    </p>
  </>
}
