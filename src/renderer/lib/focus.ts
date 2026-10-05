/**
 * [INPUT]: Connected DOM controls and the pointer/keyboard origin of an opening action.
 * [OUTPUT]: returnFocus restores a control without scrolling and preserves its input-specific focus presentation.
 * [POS]: Renderer DOM focus presentation consumed by virtual board rows.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function returnFocus(control: HTMLElement, origin?: 'pointer' | 'keyboard'): void {
  if (origin === 'pointer') {
    // Escape changes focus-visible heuristics; retain the opener's pointer presentation until keyboard use.
    control.dataset.focusReturn = 'pointer'
    const clear = () => {
      delete control.dataset.focusReturn
      control.removeEventListener('blur', clear)
      control.removeEventListener('keydown', resume, true)
    }
    const resume = (event: KeyboardEvent) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) clear() }
    control.addEventListener('blur', clear)
    control.addEventListener('keydown', resume, true)
    control.focus({ preventScroll: true })
    if (document.activeElement !== control) clear()
  } else {
    delete control.dataset.focusReturn
    control.focus({ preventScroll: true })
  }
}
