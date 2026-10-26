/**
 * [INPUT]: Localized download labels, public release assets, pre-paint platform CSS and shared menu dismissal.
 * [OUTPUT]: DownloadButton with a direct platform download and a separate other-platform disclosure.
 * [POS]: Header download anchor and shared homepage/pricing Free-plan action; native links/details work without JavaScript, phones can copy a desktop link.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
'use client'

import type { SiteCatalog } from '@/lib/i18n'
import { downloadUrl, RELEASES_URL } from '@/lib/release'
import { CopyLink } from './copy-link'
import { Icon } from './icons'
import { useDismissibleMenu } from './use-dismissible-menu'

export function DownloadButton({ copy, compactLabel, size = 'regular' }: { copy: SiteCatalog['download']; compactLabel: string; size?: 'compact' | 'regular' }) {
  const menuRef = useDismissibleMenu()
  return <div className="download-split" data-size={size} id={size === 'compact' ? 'download' : undefined}>
    {(['mac', 'windows'] as const).map(platform => (
      <a key={platform} className={`download-primary ${size === 'compact' ? 'nav-cta' : 'dl-main'}`} data-for={platform} href={downloadUrl(platform)} aria-label={copy[platform].action}>
        <span className="download-label">{copy[platform].action}</span>
        <span className="download-short" aria-hidden="true">{compactLabel}</span>
        <Icon name={platform === 'mac' ? 'apple' : 'windows'} size={18} />
      </a>
    ))}
    <details ref={menuRef} className="download-menu">
      <summary className="download-toggle" aria-label={copy.otherSystems}><Icon name="expand" size={18} /></summary>
      <div className="download-panel menu-panel" onClick={event => {
        if (event.target instanceof Element && event.target.closest('a')) menuRef.current!.open = false
      }}>
        {(['mac', 'windows'] as const).map(platform => (
          <a key={platform} data-download-option={platform} href={downloadUrl(platform)}>
            <Icon name={platform === 'mac' ? 'apple' : 'windows'} size={18} />
            <span><strong>{copy[platform].action}</strong><small>{copy[platform].detail}</small></span>
          </a>
        ))}
        <CopyLink href={RELEASES_URL} label={copy.phone} done={copy.copied} />
      </div>
    </details>
  </div>
}
