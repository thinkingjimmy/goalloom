/**
 * [INPUT]: Two bounded sync snapshots and the existing task-row/flow tokens.
 * [OUTPUT]: Identical read-only task bodies with minimal text difference highlights.
 * [POS]: Sync-only presentation; uses board task classes without task actions or editors.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SyncReviewSnapshot } from '../../../shared/contracts/sync-review'
import { horizonNames, settingsMessages as s, statusNames } from '../../i18n'
import { shortDate } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { flowVars } from '../../lib/colors'
import { Icon } from '../../components/icons'

function Difference({ value, other }: { value: string; other: string }) {
  if (value === other) return <>{value}</>
  const left = Array.from(value), right = Array.from(other)
  let start = 0, end = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start++
  while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end++
  return <>{left.slice(0, start).join('')}<mark>{left.slice(start, left.length - end).join('')}</mark>{end ? left.slice(-end).join('') : ''}</>
}

export function TaskComparison({ task, other }: { task: SyncReviewSnapshot; other: SyncReviewSnapshot }) {
  const t = s.sync
  const dates = task.periodStart ? task.periodEnd && task.horizon !== 'day' && task.horizon !== 'month'
    ? `${shortDate(task.periodStart)} – ${shortDate(addDays(task.periodEnd, -1))}` : shortDate(task.periodStart) : ''
  return <div className="sync-review-board">
    <div className="sync-review-period"><strong>{horizonNames[task.horizon]}</strong>{dates && <span>{dates}</span>}</div>
    {task.deleted || task.missing ? <div className="sync-review-deleted" data-missing={task.missing || undefined}><p>{task.title}</p><span>{task.missing ? t.reviewStates.missing : t.reviewStates.deleted}</span></div> : <>
      <article className="task-row sync-review-task" data-done={task.status === 'done'} style={flowVars(task.flowColors)}>
        {!!task.flowColors.length && <span className="flow-dot" aria-hidden="true" />}
        <span className="check" data-checked={task.status === 'done'} role="img" aria-label={statusNames[task.status]}>{task.status === 'done' && <Icon name="check" size={12} />}</span>
        <div className="sync-review-task-content"><div className="task-line"><div className="task-title"><span><Difference value={task.title} other={other.title} /></span></div></div>
          {task.description && <p className="sync-review-note"><Difference value={task.description} other={other.description} /></p>}
          {task.dueDate && <span className="sync-review-meta">{shortDate(task.dueDate)}</span>}
          {(task.archived || task.status === 'cancelled') && <span className="sync-review-meta">{task.archived ? t.reviewStates.archived : t.reviewStates.cancelled}</span>}
        </div>
      </article>
      {!!task.parents.length && <p className="sync-review-parents">{t.reviewParents} · {task.parents.join(' · ')}</p>}
    </>}
  </div>
}
