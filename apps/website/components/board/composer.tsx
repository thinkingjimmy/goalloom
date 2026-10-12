/**
 * [INPUT]: Depends on ../icons
 * [OUTPUT]: Exports Composer, ComposerPhase and ComposerCopy
 * [POS]: components/board's rendering of the app's input-method composer (text field, then one Jev candidate strip),
 *        shared by the hero demo and the Jev timeline. The phases are the app's visible states for one draft.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Icon } from '../icons'

export type ComposerPhase = 'empty' | 'typing' | 'thinking' | 'suggest'

export type ComposerCopy = {
  placeholder: string
  pending: string
  adjust: string
  keepAsLater: string
  entryTip: string
  clear: string
  close: string
}

export function Composer({ copy, text, phase, sentence, createLabel, pressed = false, onCreate, onClose, tip = true }: {
  copy: ComposerCopy
  text: string
  phase: ComposerPhase
  sentence: string
  createLabel: string
  pressed?: boolean
  onCreate?: () => void
  onClose?: () => void
  tip?: boolean
}) {
  const create = <><span>{createLabel}</span><kbd className="kc">↵</kbd></>
  return (
    <div
      className="composer" role={onClose ? 'dialog' : undefined} aria-label={onClose ? createLabel : undefined}
      onKeyDown={onClose && (event => { if (event.key === 'Escape') onClose() })}
    >
      <div className="composer-head">
        <div className="composer-input">
          <Icon name="add" size={18} />
          <div className="composer-text">
            {text ? text : <span className="composer-placeholder">{copy.placeholder}</span>}
            {phase !== 'suggest' && <span className="caret" aria-hidden="true" />}
          </div>
        </div>
        {onClose && <>
          <span className="ib" aria-hidden="true"><Icon name="delete" size={16} /></span>
          <button type="button" className="ib" aria-label={copy.close} onClick={onClose}><Icon name="close" size={16} /></button>
        </>}
      </div>
      {phase === 'thinking' && (
        <section className="cand" aria-live="polite">
          <div className="cand-line">
            <span className="jev-badge"><Icon name="smart" size={12} strokeWidth={2} />Jev</span>
            <span className="cand-pending" role="status"><span className="cand-skeleton" /><span className="cand-skeleton" data-long="true" /></span>
            <span className="cand-state">{copy.pending}</span>
          </div>
        </section>
      )}
      {phase === 'suggest' && (
        <section className="cand" aria-live="polite">
          <div className="cand-line">
            <span className="jev-badge"><Icon name="smart" size={12} strokeWidth={2} />Jev</span>
            <span className="cand-text">{sentence}</span>
            {onCreate
              ? <button type="button" className="cand-primary" data-pressed={pressed} onClick={onCreate} autoFocus>{create}</button>
              : <span className="cand-primary" data-pressed={pressed}>{create}</span>}
          </div>
          <div className="cand-hints">
            <span className="cand-hint"><kbd className="kc">Tab</kbd>{copy.adjust}</span>
            <span className="cand-hint"><kbd className="kc">⌥↵</kbd>{copy.keepAsLater}</span>
          </div>
        </section>
      )}
      {tip && <p className="composer-tip">{copy.entryTip}</p>}
    </div>
  )
}
