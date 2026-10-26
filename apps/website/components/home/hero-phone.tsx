/**
 * [INPUT]: Shared demo items/row states, localized board/sync copy and the existing Board renderer.
 * [OUTPUT]: HeroPhone, an interruptible mobile illustration that mirrors the current workspace's Today items.
 * [POS]: Hero sync scene's foreground device illustration; never connects to a sync service or offers an installer.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DemoItem, ItemId, RowState } from '@/lib/board'
import { Board, type BoardCopy } from '../board/board'
import { Icon } from '../icons'

export type HeroSyncCopy = { title: string; description: string }

export function HeroPhone({ items, rows, copy, sync, visible, animate }: {
  items: readonly DemoItem[]
  rows: Map<ItemId, RowState>
  copy: BoardCopy
  sync: HeroSyncCopy
  visible: boolean
  animate: boolean
}) {
  return <figure className="hero-phone" data-visible={visible} data-animate={animate} aria-hidden={!visible} role="img" aria-label={sync.description}>
    <div className="hero-phone-screen" aria-hidden="true" inert>
      <div className="hero-phone-status"><span>9:41</span><span className="hero-phone-island" /><span className="hero-phone-signals"><Icon name="signal" size={14} /><Icon name="battery" size={18} /></span></div>
      <div className="hero-phone-toolbar"><strong>Goalloom</strong></div>
      <Board horizons={['day']} items={items} rows={rows} edges={[]} copy={copy} />
      <div className="hero-phone-home"><span /></div>
    </div>
  </figure>
}
