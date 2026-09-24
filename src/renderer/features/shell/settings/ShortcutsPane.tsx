/**
 * [INPUT]: state/shortcuts 的本机绑定、流程筛选开关与改键动作。
 * [OUTPUT]: 快捷键分类：通用组每行点击键帽进入录制（Esc 或点击别处取消，非法组合行内提示）、冲突警告与清除；流程筛选组为一个开关加顶栏位置示意与图例。
 * [POS]: settings 的快捷键分类；只写本机偏好，不提交工作区命令。「恢复默认」在 Settings 页头。录制期间在捕获阶段吞掉按键，避免触发全局快捷键或关闭弹窗。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useRef, useState } from 'react'
import { shortcutMessages as t, shortcutNames, shortcutNotes } from '../../../i18n'
import { conflictsOf, filterCombo, formatCombo, formatKeys, parseEvent, shortcutIds, useShortcuts, validate, type ShortcutId } from '../../../state/shortcuts'
import { Icon } from '../../../components/icons'
import { FlowMark } from '../../../components/FlowMark'
import { Kbd } from '../../../components/Kbd'
import { SettingsGroup, Switch } from './parts'

// Abstract chips: 全部 plus three flows without names, so the diagram never reads as the user's own top bar.
const diagramFlows = [0, 1, 2]

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
    <SettingsGroup title={t.general}>
      {shortcutIds.map(id => {
        const combo = shortcuts.bindings[id], active = recording === id, name = shortcutNames[id]
        const conflicts = conflictsOf(shortcuts.bindings, shortcuts.filters, id)
        const warning = t.conflict(conflicts.map(other => shortcutNames[other]))
        return <div key={id} ref={active ? row : undefined} className="settings-row shortcut-row" data-recording={active}>
          <div className="settings-row-text shortcut-name"><span>{name}</span>{shortcutNotes[id] && <small>{shortcutNotes[id]}</small>}</div>
          {conflicts.length > 0 && !active && <span className="shortcut-conflict" role="img" aria-label={warning} title={warning}><Icon name="warning" size={16} /></span>}
          <button type="button" className="shortcut-keys" aria-label={t.edit(name)} aria-pressed={active} onClick={() => { if (active) stop(); else { setProblem(''); setRecording(id) } }}>
            {active ? <span className="shortcut-recording" aria-live="polite" data-problem={!!problem}>{problem || t.recording}</span> : combo ? <Kbd combo={combo} /> : <span className="shortcut-unset">{t.unset}</span>}
          </button>
          <button type="button" className="icon-button small" aria-label={t.clear(name)} disabled={!combo || active} onClick={() => shortcuts.set(id, null)}><Icon name="close" size={14} /></button>
        </div>
      })}
    </SettingsGroup>
    <SettingsGroup title={t.filters}>
      <div className="settings-row">
        <div className="settings-row-text"><span>{t.filtersToggle(mod)}</span><small>{t.filtersNote}</small></div>
        <Switch label={t.filtersToggle(mod)} checked={shortcuts.filters} onChange={shortcuts.setFilters} />
      </div>
      <div className="filter-legend" data-off={!shortcuts.filters}>
        <figure className="filter-diagram" aria-label={t.diagram}>
          <figcaption><span className="settings-tag">{t.diagramTag}</span>{t.diagramCaption}</figcaption>
          <div className="filter-diagram-slots" aria-hidden="true">
            {[null, ...diagramFlows].map((flow, index) => <div key={index} className="filter-diagram-slot">
              <span className="filter-diagram-chip" data-first={flow === null}>
                <FlowMark colors={flow === null ? [] : [flow]} />
                {flow === null ? <span>{t.legendAll}</span> : <i />}
              </span>
              <Kbd combo={filterCombo(true, index)!} />
            </div>)}
            <span className="filter-diagram-more">…</span>
          </div>
        </figure>
        <dl className="filter-keys">
          <dt><kbd className="keycap">{formatCombo('Mod+1')}</kbd></dt><dd>{t.legendAll}</dd>
          <dt><kbd className="keycap">{formatCombo('Mod+2')} – 9</kbd></dt><dd>{t.legendFlows}</dd>
        </dl>
      </div>
    </SettingsGroup>
    <p className="settings-footnote">{t.conflictNote}</p>
  </>
}
