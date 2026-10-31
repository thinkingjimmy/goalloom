/**
 * [INPUT]: Workspace snapshot, useAi state/actions, device insight settings and a way to open another settings section.
 * [OUTPUT]: Settings › 洞察: the feature switch and its DeepSeek-capable provider (shared with 智能输入); breakpoint / review switches;
 *           personalization tabs (about me; step size and extra notes for drafting; review tone and focus; the read-only prompt with the user's preferences appended).
 * [POS]: settings 的流程洞察面板。偏好、断点和复盘开关会同步；已复盘、已忽略和引导标记留在本机。这里不写工作区，也不调用模型。
 */
import { Textarea } from '../../../components/ui/fields'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { Snapshot } from '../../../../shared/contracts/queries'
import type { InsightPrefs } from '../../../../shared/contracts/smart-input'
import { draftPrompt, prefsText } from '../../../../domain/smart/insight'
import { insightMessages as t, smartMessages } from '../../../i18n'
import { updateInsight, useInsightSettings } from '../../../state/insight'
import type { Ai } from '../../../state/ai'
import { FeatureHero, ProviderChoice } from './FeatureControls'
import { Segmented, SettingsGroup, SettingsRow, Switch, ToggleChips } from './parts'
import type { Section } from './Settings'

const focusKeys = ['gap', 'overload', 'skip', 'vague'] as const
const tabs = ['about', 'draft', 'review', 'prompt'] as const
type Tab = typeof tabs[number]

export function InsightPane({ snapshot, ai, goto }: { snapshot: Snapshot; ai: Ai; goto: (section: Section) => void }) {
  const settings = useInsightSettings(), prefs = settings.prefs
  const [tab, setTab] = useState<Tab>('draft')
  const setPrefs = (patch: Partial<InsightPrefs>) => updateInsight(value => ({ ...value, prefs: { ...value.prefs, ...patch } }))
  // Only the system rules are shown from this call; they depend on the step size, never on board content.
  const system = useMemo(() => draftPrompt({ requestId: crypto.randomUUID(), generation: snapshot.workspace.generation, prefs,
    board: { today: '2000-01-01', periods: {}, goals: [], unlinked: { half: [], cycle: [], month: [], week: [], day: [] } },
    tasks: [{ id: 'sample', parent: '…', goal: null, target: '…', targetHorizon: 'week', siblings: [] }] }).system, [prefs.stepSize])
  const labels: Record<Tab, string> = { about: t.settingsAbout, draft: t.settingsDraft, review: t.settingsReview, prompt: t.settingsPrompt }
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length]!
    setTab(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
  }
  if (!ai.status) return <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{smartMessages.testing}</p>
  return <>
    <FeatureHero ai={ai} feature="insight" label={t.settingsSection} icon="split" goto={goto} />
    <ProviderChoice ai={ai} feature="insight" goto={goto} />
    <SettingsGroup title={t.settingsHints}>
      <SettingsRow title={t.settingsBreakpoints} note={t.settingsBreakpointsNote}><Switch label={t.settingsBreakpoints} checked={settings.breakpoints} onChange={value => updateInsight(current => ({ ...current, breakpoints: value }))} /></SettingsRow>
      <SettingsRow title={t.settingsReviews} note={t.settingsReviewsNote}><Switch label={t.settingsReviews} checked={settings.reviews} onChange={value => updateInsight(current => ({ ...current, reviews: value }))} /></SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={t.settingsPersonal} aside={<small className="settings-group-note text-[12px] text-muted-foreground">{t.settingsPersonalNote}</small>}>
      <div className="insight-tabs pt-0 pr-4 pb-0 pl-4.5 flex gap-5.5" role="tablist" aria-label={t.settingsPersonal} onKeyDown={move}>
        {tabs.map(value => <button key={value} type="button" role="tab" id={`insight-tab-${value}`} data-tab={value} aria-controls="insight-tab-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{labels[value]}</button>)}
      </div>
      <div id="insight-tab-panel" role="tabpanel" aria-labelledby={`insight-tab-${tab}`} className="insight-tab-panel">
        {tab === 'about' && <SettingsRow title={t.settingsAboutTitle} note={t.settingsAboutNote} below={<Textarea className="insight-textarea w-full box-border px-3 py-2.5 rounded-[8px] bg-surface text-[13px] leading-[1.6] text-foreground" aria-label={t.settingsAboutTitle} rows={3} maxLength={1000}
          placeholder={t.settingsAboutPlaceholder} value={prefs.about} onChange={event => setPrefs({ about: event.target.value })} />} />}
        {tab === 'draft' && <>
          <SettingsRow title={t.settingsStep}>
            <Segmented label={t.settingsStep} value={prefs.stepSize} onChange={stepSize => setPrefs({ stepSize })}
              options={[{ value: 'smallest', label: t.stepSmallest }, { value: 'hour', label: t.stepHour }, { value: 'halfDay', label: t.stepHalfDay }]} />
          </SettingsRow>
          <SettingsRow title={t.settingsNotes} note={t.settingsNotesNote} below={<Textarea className="insight-textarea w-full box-border px-3 py-2.5 rounded-[8px] bg-surface text-[13px] leading-[1.6] text-foreground" aria-label={t.settingsNotes} rows={2} maxLength={500}
            placeholder={t.settingsNotesPlaceholder} value={prefs.stepNotes} onChange={event => setPrefs({ stepNotes: event.target.value })} />} />
        </>}
        {tab === 'review' && <>
          <SettingsRow title={t.settingsTone}>
            <Segmented label={t.settingsTone} value={prefs.tone} onChange={tone => setPrefs({ tone })}
              options={[{ value: 'direct', label: t.toneDirect }, { value: 'gentle', label: t.toneGentle }, { value: 'questions', label: t.toneQuestions }]} />
          </SettingsRow>
          <SettingsRow title={t.settingsFocus} below={<ToggleChips label={t.settingsFocus} options={focusKeys.map(value => ({ value, label: t.focusNames[value], pressed: prefs.focus.includes(value) }))}
            onToggle={(value, pressed) => setPrefs({ focus: pressed ? [...prefs.focus, value] : prefs.focus.filter(key => key !== value) })} />} />
        </>}
        {tab === 'prompt' && <SettingsRow title={t.settingsPrompt} note={t.settingsPromptNote} below={<div className="insight-prompt flex flex-col rounded-[8px] overflow-hidden">
          <pre>{system}</pre><pre data-user>{`用户偏好：\n${prefsText(prefs, 'draft')}\n${prefsText(prefs, 'review')}`}</pre>
        </div>} />}
      </div>
    </SettingsGroup>
  </>
}
