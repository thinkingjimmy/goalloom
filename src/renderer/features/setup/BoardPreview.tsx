/**
 * [INPUT]: 各列的预览周期（domain/calendar 计算，未写库）、可选方向草稿；Board 的 periodLabel 与 horizonNames。
 * [OUTPUT]: BoardPreview：与真实看板同样的五列列头与空状态，方向草稿以虚线「待确认」行放在 3个月列。
 * [POS]: features/setup 日历步的只读预览，让用户在锁定日历前看到列头日期会怎样显示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { horizons } from '../../../shared/contracts/entities'
import type { Horizon, Period } from '../../../domain/calendar'
import { horizonNames, messages } from '../../i18n'
import { Icon } from '../../components/icons'
import { periodLabel } from '../board/Board'

export function BoardPreview({ periods, direction }: { periods: Record<Horizon, Period>; direction: string }) {
  return <figure className="board-preview" aria-label={messages.previewTitle}>
    {horizons.map(horizon => {
      const period = horizon === 'later' ? null : periods[horizon]
      const goal = horizon === 'cycle' && direction
      return <section key={horizon} className="preview-column">
        <header className="column-header">
          <h2>{horizonNames[horizon]}</h2>
          {period && <span className="column-meta">{periodLabel(horizon, period)}</span>}
        </header>
        {goal ? <div className="preview-row">
          <span className="check check-dashed" aria-hidden="true" />
          <span className="preview-title">{direction}</span>
          <span className="row-meta">{messages.draftTag}</span>
        </div> : <div className="preview-empty">
          <Icon name="empty" size={44} strokeWidth={1.1} />
          <p>{horizon === 'later' ? messages.emptyLater : horizon === 'day' ? messages.emptyDay : messages.emptyDirection}</p>
        </div>}
      </section>
    })}
  </figure>
}
