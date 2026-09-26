/**
 * [INPUT]: A committed item identity/column and the current board DOM after React layout.
 * [OUTPUT]: Whether its title is readable in the clipped board, without scrolling or changing the view.
 * [POS]: Board projection consumed by feedback; dialog coverage and flow dimming do not hide the underlying result.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { FeedbackItem, ItemVisibility } from '../../state/feedback'

export function boardItemVisibility(item: FeedbackItem): ItemVisibility {
  const column = document.querySelector(`.board-column[data-horizon="${item.placement.horizon}"]`)
  if (!column) return 'hidden-column'
  const row = document.getElementById(`item-${item.id}`)
  const title = row?.querySelector('.task-title'), content = row?.closest('.column-content'), board = column.closest('.board')
  if (!title || !content || !board || !column.contains(row)) return 'outside-view'
  const rect = title.getBoundingClientRect(), clip = content.getBoundingClientRect(), viewport = board.getBoundingClientRect()
  const left = Math.max(rect.left, clip.left, viewport.left, 0), right = Math.min(rect.right, clip.right, viewport.right, window.innerWidth)
  const top = Math.max(rect.top, clip.top, viewport.top, 0), bottom = Math.min(rect.bottom, clip.bottom, viewport.bottom, window.innerHeight)
  // Require a readable line and most of the title width, rather than one overscan pixel.
  return right - left >= rect.width * .75 && bottom - top >= Math.min(rect.height, 32) && rect.width > 0 && rect.height > 0
    ? 'visible' : 'outside-view'
}
