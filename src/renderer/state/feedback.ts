/**
 * [INPUT]: Accepted command receipts, committed item placement and post-layout board visibility.
 * [OUTPUT]: Success feedback policy, destination text and reading durations; no undo membership changes.
 * [POS]: Renderer feedback projection, shared by useWorkspace and the application shell.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CommandInput, CommandResult } from '../../shared/contracts/commands'
import type { Item } from '../../shared/contracts/entities'
import type { Snapshot } from '../../shared/contracts/queries'
import { horizonNames, messages, statusNames } from '../i18n'

export type FeedbackItem = Pick<Item, 'id' | 'title' | 'status' | 'archivedAt' | 'placement'>
export type ItemVisibility = 'visible' | 'hidden-column' | 'outside-view'
export type FeedbackKind = 'standard' | 'conditional' | 'restore' | 'undo' | 'undoBatch'
export interface Feedback { result: CommandResult; text: string; detail: string | null; warning: string | null; durationMs: number | null }
export interface FeedbackCandidate { result: CommandResult; kind: FeedbackKind; item: FeedbackItem | null; revision: number }

export function feedbackKind(command: CommandInput, result: CommandResult): FeedbackKind | null {
  if (!result.changed) return null
  if (result.originalOperationId) return command.type === 'undoBatch' ? 'undoBatch' : 'undo'
  if (!result.undoable) return null
  switch (command.type) {
    case 'create': case 'move': case 'arrangeBacklog': case 'link': case 'unlink': return null
    case 'status': return command.status === 'done' ? null : command.status === 'todo' ? 'conditional' : 'standard'
    case 'archive': return command.archived ? 'standard' : 'conditional'
    case 'createPlan': return command.items.length === 1 ? 'conditional' : 'standard'
    case 'restoreItem': return 'restore'
    default: return 'standard'
  }
}

export function systemFeedback(result: CommandResult): Feedback {
  return { result, text: result.label, detail: null, warning: null, durationMs: 6000 }
}

export function resolveFeedback(candidate: FeedbackCandidate, snapshot: Snapshot, visibility: ItemVisibility): Feedback | null {
  const { result, kind, item } = candidate
  if (kind === 'conditional' && visibility === 'visible') return null
  const isUndo = result.originalOperationId !== null
  const warning = kind === 'restore' && result.warnings.length ? result.warnings.join(messages.sentenceJoin) : null
  const text = warning ? messages.feedbackPartialRestore(item?.title ?? null)
    : (isUndo ? messages.undone : messages.applied)(result.label, item?.title ?? null)
  let detail: string | null = null
  if (item && (kind === 'conditional' || kind === 'restore')) {
    const { horizon, periodId } = item.placement
    const location = [horizonNames[horizon]]
    if (periodId && snapshot.periods.find(period => period.horizon === horizon)?.id !== periodId) location.push(messages.feedbackPast)
    if (item.archivedAt) location.push(messages.archivedTag)
    if (item.status !== 'todo') location.push(statusNames[item.status])
    if (visibility === 'hidden-column') location.push(messages.feedbackHiddenColumn)
    else if (visibility === 'outside-view') location.push(messages.feedbackOutsideView)
    detail = messages.feedbackDestination(location.join(' · '))
  }
  return { result, text, detail, warning, durationMs: warning ? null : kind === 'undo' && !result.restoreSource ? 2500 : 6000 }
}
