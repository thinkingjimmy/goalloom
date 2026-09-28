/**
 * [INPUT]: Lexical/DOM selection, measured floating placement, localized labels and safe URL validation.
 * [OUTPUT]: Selection formatting and explicit link edits with a preserved anchor, rendered in the owning dialog's floating layer.
 * [POS]: Local editor tools inside the owning dialog, with no persistence or network calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { $createTextNode, $getNodeByKey, $getSelection, $isNodeSelection, $isRangeSelection, $setSelection, COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, KEY_DOWN_COMMAND, type BaseSelection, type TextFormatType } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { normalizeLinkUrl } from '../../../shared/links'
import { messages, useLocale } from '../../i18n'
import { Icon } from '../icons'
import { $createDescriptionLink, $isDescriptionLink } from './DescriptionLink'
import { useSelectionPosition } from './selection-position'

export function SelectionTools() {
  useLocale()
  const [editor] = useLexicalComposerContext()
  const selection = useRef<BaseSelection | null>(null), panel = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<Range | null>(null)
  const [formats, setFormats] = useState<string[]>([])
  const [link, setLink] = useState<{ key: string | null; url: string; label: string } | null>(null)
  const linkRef = useRef(link); linkRef.current = link
  const root = editor.getRootElement()
  const position = useSelectionPosition(root, anchor, panel, !!link)
  const openLink = () => editor.getEditorState().read(() => {
    const current = $getSelection()
    if (!current) return
    selection.current = current.clone()
    const node = current.getNodes().find($isDescriptionLink)
    setLink({ key: node?.getKey() ?? null, url: node?.getURL() ?? '', label: node?.getLabel() ?? (node ? '' : current.getTextContent()) })
    const domSelection = window.getSelection()
    if (root && domSelection?.rangeCount && root.contains(domSelection.anchorNode)) setAnchor(domSelection.getRangeAt(0).cloneRange())
    else if (!anchor && root) { const range = document.createRange(); range.selectNodeContents(root); range.collapse(true); setAnchor(range) }
  })
  const openRef = useRef(openLink); openRef.current = openLink
  useEffect(() => {
    const update = () => {
      if (linkRef.current || panel.current?.contains(document.activeElement)) return
      const root = editor.getRootElement(), domSelection = window.getSelection()
      editor.getEditorState().read(() => {
        const current = $getSelection()
        if (!root || !current || current.isCollapsed() || !domSelection?.rangeCount || !root.contains(domSelection.anchorNode)) { setAnchor(null); return }
        selection.current = current.clone()
        setAnchor(domSelection.getRangeAt(0).cloneRange())
        setFormats($isRangeSelection(current) ? (['bold', 'italic', 'strikethrough', 'code'] as const).filter(format => current.hasFormat(format)) : [])
      })
    }
    const unregister = editor.registerUpdateListener(update)
    document.addEventListener('selectionchange', update)
    return () => { unregister(); document.removeEventListener('selectionchange', update) }
  }, [editor])
  useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); openRef.current(); return true }
    return false
  }, COMMAND_PRIORITY_HIGH), [editor])
  const restore = () => { if (selection.current) $setSelection(selection.current.clone()) }
  const format = (value: TextFormatType) => { editor.update(() => { restore(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, value) }); editor.focus() }
  const finish = (remove = false) => {
    if (!link) return
    const url = normalizeLinkUrl(link.url)
    if (!remove && !url) return
    editor.update(() => {
      restore()
      const previous = link.key ? $getNodeByKey(link.key) : null
      if (remove && $isDescriptionLink(previous)) previous.replace($createTextNode(previous.getLabel() ?? previous.getURL()))
      else if (url) {
        const label = link.label.trim(), source = label ? `[${label.replace(/[\[\]\\]/g, '\\$&')}](${url})` : url
        const node = $createDescriptionLink(url, label || null, source)
        if ($isDescriptionLink(previous)) previous.replace(node)
        else {
          const current = $getSelection()
          if ($isRangeSelection(current) || $isNodeSelection(current)) current.insertNodes([node])
        }
        node.selectNext()
      }
    })
    setLink(null); setAnchor(null); editor.focus()
  }
  if (!anchor && !link) return null
  return createPortal(<div ref={panel} className="description-tools" style={position} role="toolbar" aria-label={messages.formatSelection}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setLink(null); setAnchor(null); editor.focus() }
      if (link && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); finish() }
    }}>
    {link ? <div className="description-link-form">
      <label>{messages.linkAddress}<input autoFocus value={link.url} onChange={event => setLink({ ...link, url: event.target.value })} placeholder="https://" /></label>
      <label>{messages.linkText}<input value={link.label} onChange={event => setLink({ ...link, label: event.target.value })} /></label>
      <div><button type="button" onClick={() => { setLink(null); editor.focus() }}>{messages.cancel}</button>{link.key && <button type="button" onClick={() => finish(true)}>{messages.removeLink}</button>}<button type="button" disabled={!normalizeLinkUrl(link.url)} onClick={() => finish()}>{messages.save}</button></div>
    </div> : <>
      {(['bold', 'italic', 'strikethrough', 'code'] as const).map((value, index) => <button key={value} type="button" aria-label={[messages.formatBold, messages.formatItalic, messages.formatStrike, messages.formatCode][index]} aria-pressed={formats.includes(value)}
        onMouseDown={event => event.preventDefault()} onClick={() => format(value)}><span className={`format-${value}`}>{['B', 'I', 'S', '</>'][index]}</span></button>)}
      <button type="button" aria-label={messages.editLink} onMouseDown={event => event.preventDefault()} onClick={openLink}><Icon name="link" size={16} /></button>
    </>}
  </div>, root?.closest('dialog') ?? document.body)
}
