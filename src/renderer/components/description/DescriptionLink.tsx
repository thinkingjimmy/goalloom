/**
 * [INPUT]: Authored URL/source tokens, the saved-destination context and shared inline previews.
 * [OUTPUT]: A selectable inline Lexical node whose Markdown/text always comes from its source.
 * [POS]: Editor adapter only; page metadata never enters editor state or history.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { $applyNodeReplacement, DecoratorNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical'
import { InlineLink } from '../links/LinkText'

export const SavedLinks = createContext<ReadonlySet<string>>(new Set())
type SerializedLink = Spread<{ type: 'description-link'; url: string; label: string | null; source: string }, SerializedLexicalNode>

function LinkView({ url, label }: { url: string; label: string | null }) {
  const saved = useContext(SavedLinks)
  return <InlineLink url={url} label={label ?? ''} named={label !== null} enabled={saved.has(url)} />
}

export class DescriptionLinkNode extends DecoratorNode<ReactNode> {
  __url: string
  __label: string | null
  __source: string
  static getType(): string { return 'description-link' }
  static clone(node: DescriptionLinkNode): DescriptionLinkNode { return new DescriptionLinkNode(node.__url, node.__label, node.__source, node.__key) }
  constructor(url = '', label: string | null = null, source = url, key?: NodeKey) {
    super(key); this.__url = url; this.__label = label; this.__source = source
  }
  static importJSON(value: SerializedLink): DescriptionLinkNode { return $createDescriptionLink(value.url, value.label, value.source) }
  exportJSON(): SerializedLink { return { ...super.exportJSON(), type: 'description-link', url: this.getURL(), label: this.getLabel(), source: this.getTextContent() } }
  createDOM(): HTMLElement { const element = document.createElement('span'); element.className = 'description-link'; return element }
  updateDOM(): false { return false }
  isInline(): true { return true }
  isKeyboardSelectable(): true { return true }
  getURL(): string { return this.getLatest().__url }
  getLabel(): string | null { return this.getLatest().__label }
  getTextContent(): string { return this.getLatest().__source }
  decorate(): ReactNode { return <LinkView url={this.getURL()} label={this.getLabel()} /> }
}

export function $createDescriptionLink(url: string, label: string | null, source = url): DescriptionLinkNode {
  return $applyNodeReplacement(new DescriptionLinkNode(url, label, source))
}
export function $isDescriptionLink(node: unknown): node is DescriptionLinkNode { return node instanceof DescriptionLinkNode }
