/**
 * [INPUT]: Markdown draft source, saved URL membership, read-only state, an optional DOM id (a board peek must not reuse the detail id) and the change callback.
 * [OUTPUT]: In-place rich editing with immediately persisted task-list changes, source-preserving Markdown and local undo.
 * [POS]: Lazy detail presentation; persistence and revision ownership remain in ItemDetail.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { $addUpdateTag, $getNodeByKey, $getRoot, $getSelection, $isRangeSelection, $setSelection, BLUR_COMMAND, CLEAR_HISTORY_COMMAND, COMMAND_PRIORITY_HIGH, COPY_COMMAND, CUT_COMMAND, CUT_TAG, DROP_COMMAND, HISTORY_PUSH_TAG, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, PASTE_COMMAND, PASTE_TAG, RootNode, defineExtension } from 'lexical'
import { $convertFromMarkdownString, $convertSelectionToMarkdownString, $convertToMarkdownString, $generateNodesFromMarkdownString, registerMarkdownShortcuts } from '@lexical/markdown'
import { RichTextExtension } from '@lexical/rich-text'
import { $isListItemNode, CheckListExtension } from '@lexical/list'
import { CodeExtension } from '@lexical/code'
import { HistoryExtension } from '@lexical/history'
import { mergeRegister } from '@lexical/utils'
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { messages, useLocale } from '../../i18n'
import { matches, useShortcuts } from '../../state/shortcuts'
import { checkmarkMask } from '../icons'
import { DescriptionLinkNode, SavedLinks } from './DescriptionLink'
import { $linkifyDescription, descriptionTransformers } from './markdown'
import { SelectionTools } from './SelectionTools'
import './description.css'

const serialize = () => $convertToMarkdownString(descriptionTransformers, undefined, true)

function Bridge({ value, readOnly, onChange }: { value: string; readOnly: boolean; onChange: (value: string, immediate?: boolean) => void }) {
  const [editor] = useLexicalComposerContext()
  const callback = useRef(onChange); callback.current = onChange
  const source = useRef({ raw: value, canonical: '', sent: value })
  const historyBoundary = useRef(false)
  const { bindings } = useShortcuts(), submitCombo = useRef(bindings.submit); submitCombo.current = bindings.submit
  useLayoutEffect(() => {
    source.current.canonical = editor.getEditorState().read(serialize)
    return editor.registerUpdateListener(({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
      if (tags.has('description-sync') || (!dirtyElements.size && !dirtyLeaves.size)) return
      const canonical = editorState.read(serialize)
      const next = canonical === source.current.canonical ? source.current.raw : canonical
      if (next !== source.current.sent) {
        const toggled = [...dirtyElements.keys()].some(key => {
          const checked = () => { const node = $getNodeByKey(key); return $isListItemNode(node) ? node.getChecked() : undefined }
          const before = prevEditorState.read(checked), after = editorState.read(checked)
          return before !== undefined && after !== undefined && before !== after
        })
        source.current.sent = next; callback.current(next, toggled)
      }
    })
  }, [editor])
  useEffect(() => {
    if (value === source.current.sent) return
    editor.update(() => {
      $convertFromMarkdownString(value, descriptionTransformers, undefined, true)
      $setSelection(null)
      source.current = { raw: value, canonical: serialize(), sent: value }
    }, { tag: 'description-sync', discrete: true })
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
  }, [editor, value])
  useEffect(() => { editor.setEditable(!readOnly) }, [editor, readOnly])
  useEffect(() => {
    const copy = (event: ClipboardEvent | KeyboardEvent | null, cut: boolean) => {
      if (cut && readOnly) return false
      if (!(event instanceof ClipboardEvent) || !event.clipboardData) return false
      const selection = $getSelection()
      if (!selection || selection.isCollapsed()) return false
      event.preventDefault()
      event.clipboardData.setData('text/plain', $convertSelectionToMarkdownString(descriptionTransformers, selection, true))
      if (cut) $addUpdateTag(CUT_TAG)
      if (cut && $isRangeSelection(selection)) selection.removeText()
      else if (cut) selection.getNodes().forEach(node => node.remove())
      return true
    }
    return mergeRegister(
      readOnly ? () => {} : registerMarkdownShortcuts(editor, descriptionTransformers),
      editor.registerNodeTransform(RootNode, () => {
        if (historyBoundary.current) { $addUpdateTag(HISTORY_PUSH_TAG); historyBoundary.current = false }
      }),
      // The detail's save combo (⌘↵ by default) belongs to the form: no paragraph is inserted and the keydown still bubbles to it.
      editor.registerCommand(KEY_ENTER_COMMAND, event => { if (!event || !matches(event, submitCombo.current)) return false; event.preventDefault(); return true }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(BLUR_COMMAND, () => { if (!readOnly) $linkifyDescription(); historyBoundary.current = true; return false }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, event => {
        if (readOnly) return false
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false
        const items = [...new Set(selection.getNodes().flatMap(node => {
          const item = $isListItemNode(node) ? node : node.getParents().find($isListItemNode)
          return item ? [item] : []
        }))]
        if (!items.length) return false
        event.preventDefault()
        items.forEach(item => item.setIndent(Math.max(0, Math.min(8, item.getIndent() + (event.shiftKey ? -1 : 1)))))
        return true
      }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(PASTE_COMMAND, event => {
        if (readOnly || !(event instanceof ClipboardEvent)) return false
        event.preventDefault()
        $addUpdateTag(PASTE_TAG)
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const selection = $getSelection()
        if (text && $isRangeSelection(selection)) {
          const root = $getRoot(), contents = root.getTextContent()
          // Lexical uses different block separators for root and range text.
          const entireDocument = !selection.isCollapsed() && selection.getTextContent().replace(/\n/g, '') === contents.replace(/\n/g, '')
          if (!contents || entireDocument) {
            $convertFromMarkdownString(text, descriptionTransformers, undefined, true)
            root.selectEnd()
          } else selection.insertNodes($generateNodesFromMarkdownString(text, descriptionTransformers, true))
        }
        return true
      }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DROP_COMMAND, event => { event.preventDefault(); return true }, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(COPY_COMMAND, event => copy(event, false), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, event => copy(event, true), COMMAND_PRIORITY_HIGH),
    )
  }, [editor, readOnly])
  return null
}

export function DescriptionEditor({ value, savedUrls, onChange, readOnly = false, id = 'item-description' }: { value: string; savedUrls: ReadonlySet<string>; onChange: (value: string, immediate?: boolean) => void; readOnly?: boolean; id?: string }) {
  useLocale()
  const initial = useRef(value)
  const extension = useMemo(() => defineExtension({
    name: 'goalloom/description', namespace: 'goalloom-description',
    dependencies: [RichTextExtension, CheckListExtension, CodeExtension, HistoryExtension],
    nodes: [DescriptionLinkNode],
    theme: { code: 'description-code-block', text: { bold: 'description-bold', italic: 'description-italic', strikethrough: 'description-strike', code: 'description-code' }, list: { checklist: 'description-checklist', nested: { listitem: 'description-nested' } } },
    $initialEditorState: () => { $convertFromMarkdownString(initial.current, descriptionTransformers, undefined, true); $setSelection(null) },
  }), [])
  return <SavedLinks.Provider value={savedUrls}><div className="description-editor" data-readonly={readOnly} style={{ '--description-checkmark': checkmarkMask } as CSSProperties}>
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <ContentEditable id={id} className="note-input description-content" aria-label={messages.description} aria-multiline="true" aria-readonly={readOnly}
        aria-placeholder={messages.descriptionPlaceholder} placeholder={<span className="description-placeholder">{messages.descriptionPlaceholder}</span>} spellCheck />
      <Bridge value={value} readOnly={readOnly} onChange={onChange} />
      {!readOnly && <SelectionTools />}
    </LexicalExtensionComposer>
  </div></SavedLinks.Provider>
}
