/**
 * [INPUT]: Workspace snapshot, device insight settings, smart status and a way to open the 智能输入 section.
 * [OUTPUT]: Settings › 洞察: breakpoint / review switches and guide replay; about-me, step size and extra notes for drafting; review tone and focus;
 *           a try-it panel that drafts one step and one review line from the current board without writing; the model row and the read-only prompt with the user's preferences appended.
 * [POS]: settings 的流程洞察面板；偏好只存本机（state/insight），试一试不产生任何写入。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo, useState } from 'react'
import type { Snapshot } from '../../../../shared/contracts/queries'
import type { DraftTitle, InsightPrefs, ReviewText, SmartStatus } from '../../../../shared/contracts/smart-input'
import { draftPrompt, prefsText } from '../../../../domain/smart/insight'
import { insightMessages as t } from '../../../i18n'
import { insightReady, requestDraft, requestReview, updateInsight, useInsightSettings } from '../../../state/insight'
import { useFlows } from '../../../state/flows'
import { Icon } from '../../../components/icons'
import { boardDigest, breakpoints, draftTarget, periodText, shorter } from '../../insight/signals'
import { reviewDue, reviewSignals } from '../../insight/review'
import { Segmented, SettingsGroup, SettingsRow, Switch, ToggleChips } from './parts'

const focusKeys = ['gap', 'overload', 'skip', 'vague'] as const

export function InsightPane({ snapshot, status, openSmart }: { snapshot: Snapshot; status: SmartStatus | null; openSmart: () => void }) {
  const settings = useInsightSettings(), prefs = settings.prefs
  const flows = useFlows(snapshot, snapshot.items)
  const ready = insightReady(status)
  const [trial, setTrial] = useState<{ parent: string; target: string; draft: DraftTitle | null; review: ReviewText | null; error: string | null } | 'pending' | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const setPrefs = (patch: Partial<InsightPrefs>) => updateInsight(value => ({ ...value, prefs: { ...value.prefs, ...patch } }))

  // The try-it sample: the first gap of any flow, else the first open plan with a shorter column.
  const sample = useMemo(() => {
    for (const flow of flows.visible) {
      const gap = breakpoints(snapshot, flows, flow.id, ['cycle', 'month', 'week', 'day'], () => 'current').gaps[0]
      if (gap) return { parent: gap.parent, target: gap.target }
    }
    const parent = snapshot.items.find(item => item.status === 'todo' && !item.archivedAt && shorter(item.placement.horizon))
    return parent ? { parent, target: shorter(parent.placement.horizon)! } : null
  }, [snapshot, flows])
  const task = sample && (() => {
    const { period, next } = draftTarget(snapshot, sample.target)
    return { id: sample.parent.id, kind: 'next' as const, parent: sample.parent.title, goal: flows.of(sample.parent.id).find(flow => flow.id !== sample.parent.id)?.title ?? null,
      target: periodText(period, next), targetHorizon: sample.target, siblings: [], children: [] }
  })()
  const tryIt = async () => {
    if (!task) return
    setTrial('pending')
    const board = boardDigest(snapshot, flows), generation = snapshot.workspace.generation
    const due = reviewDue(snapshot, []) ?? { scope: 'week' as const, week: null, month: null }
    const [draft, review] = await Promise.all([requestDraft({ generation, board, tasks: [task] }), requestReview({ generation, scope: due.scope, board, signals: reviewSignals(snapshot, flows, due) })])
    setTrial({ parent: task.parent, target: task.target, draft: draft.ok ? draft.value[0] ?? null : null, review: review.ok ? review.value : null,
      error: !draft.ok ? draft.failure?.message ?? t.settingsTryFailed : !review.ok ? review.failure?.message ?? t.settingsTryFailed : null })
  }
  const prompt = useMemo(() => draftPrompt({ requestId: crypto.randomUUID(), generation: snapshot.workspace.generation, board: boardDigest(snapshot, flows), prefs,
    tasks: [task ?? { id: 'sample', kind: 'next', parent: '…', goal: null, target: '…', targetHorizon: 'week', siblings: [], children: [] }] }).system, [prefs.stepSize])

  return <>
    <SettingsGroup title={t.settingsHints}>
      <SettingsRow title={t.settingsBreakpoints} note={t.settingsBreakpointsNote}><Switch label={t.settingsBreakpoints} checked={settings.breakpoints} onChange={value => updateInsight(current => ({ ...current, breakpoints: value }))} /></SettingsRow>
      <SettingsRow title={t.settingsReviews} note={t.settingsReviewsNote}><Switch label={t.settingsReviews} checked={settings.reviews} onChange={value => updateInsight(current => ({ ...current, reviews: value }))} /></SettingsRow>
      <SettingsRow title={t.settingsGuide} note={settings.onboarded ? t.settingsGuideSeen : t.settingsGuidePending}>
        <button type="button" className="settings-button subtle" disabled={!settings.onboarded} onClick={() => updateInsight(current => ({ ...current, onboarded: false }))}>{t.settingsGuideAgain}</button>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={t.settingsAbout} aside={<small className="settings-group-note">{t.settingsLocalOnly}</small>}>
      <SettingsRow title={t.settingsAboutTitle} note={t.settingsAboutNote} below={<textarea className="insight-textarea" aria-label={t.settingsAboutTitle} rows={3} maxLength={1000}
        placeholder={t.settingsAboutPlaceholder} value={prefs.about} onChange={event => setPrefs({ about: event.target.value })} />} />
    </SettingsGroup>
    <SettingsGroup title={t.settingsDraft}>
      <SettingsRow title={t.settingsStep}>
        <Segmented label={t.settingsStep} value={prefs.stepSize} onChange={stepSize => setPrefs({ stepSize })}
          options={[{ value: 'smallest', label: t.stepSmallest }, { value: 'hour', label: t.stepHour }, { value: 'halfDay', label: t.stepHalfDay }]} />
      </SettingsRow>
      <SettingsRow title={t.settingsNotes} note={t.settingsNotesNote} below={<textarea className="insight-textarea" aria-label={t.settingsNotes} rows={2} maxLength={500}
        placeholder={t.settingsNotesPlaceholder} value={prefs.stepNotes} onChange={event => setPrefs({ stepNotes: event.target.value })} />} />
    </SettingsGroup>
    <SettingsGroup title={t.settingsReview}>
      <SettingsRow title={t.settingsTone}>
        <Segmented label={t.settingsTone} value={prefs.tone} onChange={tone => setPrefs({ tone })}
          options={[{ value: 'direct', label: t.toneDirect }, { value: 'gentle', label: t.toneGentle }, { value: 'questions', label: t.toneQuestions }]} />
      </SettingsRow>
      <SettingsRow title={t.settingsFocus} below={<ToggleChips label={t.settingsFocus} options={focusKeys.map(value => ({ value, label: t.focusNames[value], pressed: prefs.focus.includes(value) }))}
        onToggle={(value, pressed) => setPrefs({ focus: pressed ? [...prefs.focus, value] : prefs.focus.filter(key => key !== value) })} />} />
    </SettingsGroup>
    <SettingsGroup title={t.settingsTry} aside={<small className="settings-group-note">{t.settingsModelName}</small>}>
      {trial && trial !== 'pending' && <div className="insight-trial" aria-live="polite">
        {trial.draft && <p><small>{t.settingsTryDraft(trial.parent, trial.target)}</small><span>{trial.draft.title}</span>{trial.draft.why && <small>{trial.draft.why}</small>}</p>}
        {trial.review && <p><small>{t.settingsTryReview}</small><span>{trial.review.advice || trial.review.headline}</span></p>}
        {trial.error && <p className="settings-alert" role="alert">{trial.error}</p>}
      </div>}
      <SettingsRow title={t.settingsTryTitle} note={ready ? t.settingsTryNote : t.settingsNeedsKey}>
        {ready ? <button type="button" className="settings-button subtle" disabled={!task || trial === 'pending'} onClick={() => void tryIt()}><Icon name="smart" size={14} />{trial === 'pending' ? t.generating : t.settingsTryRun}</button>
          : <button type="button" className="settings-button subtle" onClick={openSmart}>{t.settingsConnect}</button>}
      </SettingsRow>
      <SettingsRow title={t.settingsPrompt} note={t.settingsPromptNote} below={showPrompt ? <div className="insight-prompt">
        <pre>{prompt}</pre><pre data-user>{`用户偏好：\n${prefsText(prefs, 'draft')}\n${prefsText(prefs, 'review')}`}</pre>
      </div> : undefined}>
        <button type="button" className="settings-button subtle" aria-expanded={showPrompt} onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? t.settingsPromptHide : t.settingsPromptShow}</button>
      </SettingsRow>
    </SettingsGroup>
  </>
}
