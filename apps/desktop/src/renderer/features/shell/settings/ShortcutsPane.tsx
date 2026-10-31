/**
 * [INPUT]: state/shortcuts 的本机绑定、流程筛选开关与改键动作。
 * [OUTPUT]: 快捷键分类：通用组每行点击键帽进入录制（Esc 或点击别处取消，非法组合行内提示）、冲突警告与清除；流程筛选组为一个开关加顶栏位置示意与图例。
 * [POS]: Settings shortcut controls; shared guidance lives in the Settings header. Writes device preferences only, restores defaults in the general group, and captures recording keys before global handlers.
 */
import { SettingsButton, IconButton } from '../../../components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { horizonNames, shortcutMessages as t, shortcutNames, shortcutNotes } from '../../../i18n'
import { conflictsOf, filterCombo, formatCombo, formatKeys, parseEvent, shortcutIds, useShortcuts, validate, type ShortcutId } from '../../../state/shortcuts'
import { Icon } from '../../../components/icons'
import { FlowMark } from '../../../components/FlowMark'
import { Kbd } from '../../../components/Kbd'
import { SettingsGroup, Switch } from './parts'

// Abstract chips: 全部 plus three flows without names, so the diagram never reads as the user's own top bar.
const diagramFlows = [0, 1]

export function ShortcutsPane() {
  const shortcuts = useShortcuts()
  const [recording, setRecording] = useState<ShortcutId | null>(null), [problem, setProblem] = useState('')
  const row = useRef<HTMLDivElement>(null)
  const stop = () => { setRecording(null); setProblem('') }
  useEffect(() => {
    if (!recording) return
    const keydown = (event: KeyboardEvent) => {
      // Capture on window runs before App's global handler and the dialog's Esc-to-close.
      event.preventDefault(); event.stopPropagation()
      if (event.isComposing) return
      if (event.code === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) { stop(); return }
      const combo = parseEvent(event)
      if (!combo) return
      const invalid = validate(combo)
      if (invalid) { setProblem(invalid === 'modifier' ? t.needsModifier : t.reserved); return }
      shortcuts.set(recording, combo); stop()
    }
    const pointerdown = (event: PointerEvent) => { if (!row.current?.contains(event.target as Node)) stop() }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('pointerdown', pointerdown, true)
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('pointerdown', pointerdown, true) }
  }, [recording, shortcuts])

  const mod = formatKeys('Mod+1')[0]!
  return <>
    <SettingsGroup title={t.general} aside={<SettingsButton variant="link" type="button" disabled={!shortcuts.customized} onClick={shortcuts.reset}>{t.restore}</SettingsButton>}>
      {shortcutIds.map(id => {
        const combo = shortcuts.bindings[id], active = recording === id, name = shortcutNames[id]
        const conflicts = conflictsOf(shortcuts.bindings, shortcuts.filters, id)
        const warning = t.conflict(conflicts.map(other => shortcutNames[other]))
        return <div key={id} ref={active ? row : undefined} className="settings-row shortcut-row flex items-center min-h-12.5 pt-2 pr-2.5 pb-2 pl-4.5 gap-3" data-recording={active}>
          <div className="settings-row-text shortcut-name flex-1 min-w-0 flex text-[14px] flex-row items-baseline gap-2.5"><span>{name}</span>{shortcutNotes[id] && <small>{shortcutNotes[id]}</small>}</div>
          {conflicts.length > 0 && !active && <span className="shortcut-conflict inline-grid place-items-center text-warning" role="img" aria-label={warning} title={warning}><Icon name="warning" size={16} /></span>}
          <button type="button" className="shortcut-keys min-w-24 h-7.5 px-2 py-0 flex items-center justify-end rounded-[8px]" aria-label={t.edit(name)} aria-pressed={active} onClick={() => { if (active) stop(); else { setProblem(''); setRecording(id) } }}>
            {active ? <span className="shortcut-recording text-focus" aria-live="polite" data-problem={!!problem}>{problem || t.recording}</span> : combo ? <Kbd combo={combo} /> : <span className="shortcut-unset">{t.unset}</span>}
          </button>
          <IconButton size="small" type="button" aria-label={t.clear(name)} disabled={!combo || active} onClick={() => shortcuts.set(id, null)}><Icon name="close" size={14} /></IconButton>
        </div>
      })}
    </SettingsGroup>
    <SettingsGroup title={t.filters}>
      <div className="settings-row min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex items-center gap-4">
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]"><span>{t.filtersToggle(mod)}</span><small>{t.filtersNote}</small></div>
        <Switch label={t.filtersToggle(mod)} checked={shortcuts.filters} onChange={shortcuts.setFilters} />
      </div>
      <div className="filter-legend px-4.5 py-4 flex items-center gap-6" data-off={!shortcuts.filters}>
        <figure className="filter-diagram m-0 shrink-0 pt-2.5 pr-3 pb-3 pl-3 flex flex-col gap-2 rounded-[10px] bg-background" aria-label={t.diagram}>
          <figcaption><span className="settings-tag ml-2 h-4.5 px-1.5 py-0 inline-flex items-center rounded-[5px] bg-hover text-[11px] font-medium text-soft">{t.diagramTag}</span>{t.diagramCaption}</figcaption>
          <div className="filter-diagram-slots flex items-start gap-1" aria-hidden="true">
            {(['later', 'all', ...diagramFlows] as const).map((slot, index) => <div key={index} className="filter-diagram-slot w-14.5 flex flex-col items-center gap-2">
              <span className="filter-diagram-chip w-14.5 h-6 flex items-center justify-center gap-[5px] rounded-[6px] text-[11.5px] text-soft" data-first={typeof slot === 'string'}>
                {slot === 'later' ? <Icon name="later" size={12} strokeWidth={1.8} /> : <FlowMark colors={slot === 'all' ? [] : [slot]} />}
                {slot === 'later' ? <span>{horizonNames.later}</span> : slot === 'all' ? <span>{t.legendAll}</span> : <i />}
              </span>
              <Kbd combo={filterCombo(true, index)!} />
            </div>)}
            <span className="filter-diagram-more h-6 flex items-center px-1 py-0 text-[13px] text-muted-foreground">…</span>
          </div>
        </figure>
        <dl className="filter-keys flex-1 min-w-0 m-0 grid items-center gap-3 text-[13px] text-soft">
          <dt><kbd className="keycap">{formatCombo('Mod+1')}</kbd></dt><dd>{horizonNames.later}</dd>
          <dt><kbd className="keycap">{formatCombo('Mod+2')}</kbd></dt><dd>{t.legendAll}</dd>
          <dt><kbd className="keycap">{formatCombo('Mod+3')} – 9</kbd></dt><dd>{t.legendFlows}</dd>
        </dl>
      </div>
    </SettingsGroup>
  </>
}
