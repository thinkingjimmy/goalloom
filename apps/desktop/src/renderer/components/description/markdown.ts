/**
 * [INPUT]: Lexical Markdown transforms and the shared URL parser.
 * [OUTPUT]: A finite Markdown dialect with task-list state and authored URL serialization.
 * [POS]: Shared import/export/input-rule policy; HTML is always plain text.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { $copyNode, $createTextNode, $getRoot } from 'lexical'
import { $isCodeNode } from '@lexical/code'
import { $createListItemNode, $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list'
import { CHECK_LIST, CODE, HEADING, ORDERED_LIST, QUOTE, UNORDERED_LIST, TEXT_FORMAT_TRANSFORMERS, type TextMatchTransformer, type Transformer } from '@lexical/markdown'
import { parseLinks } from '../links/parse'
import { $createDescriptionLink, $isDescriptionLink, DescriptionLinkNode } from './DescriptionLink'

// The "- " shortcut has already made a bullet before "[ ] " is typed.
// Split only that item into a checklist, preserving its neighbors and depth.
const checklistShortcut: TextMatchTransformer = {
  type: 'text-match', dependencies: [ListNode, ListItemNode], trigger: ' ', regExp: /^\[([ x])\] $/i,
  replace: (node, match) => {
    const item = node.getParent(), list = item?.getParent()
    if (node.hasFormat('code') || !$isListItemNode(item) || !$isListNode(list) || list.getListType() === 'number' || !node.is(item.getFirstChild())) return
    if (list.getListType() !== 'check') {
      const following = item.getNextSiblings(), container = list.getParent()
      const checklist = $copyNode(list).setListType('check')
      const tail = following.length ? $copyNode(list).append(...following) : null
      if ($isListItemNode(container)) {
        const wrapper = $createListItemNode().append(checklist)
        container.insertAfter(wrapper)
        if (tail) wrapper.insertAfter($createListItemNode().append(tail))
      } else {
        list.insertAfter(checklist)
        if (tail) checklist.insertAfter(tail)
      }
      checklist.append(item)
      if (list.isEmpty()) ($isListItemNode(container) ? container : list).remove()
    }
    item.setChecked(match[1]?.toLowerCase() === 'x')
    node.remove(); item.selectStart()
  },
}

const destination = String.raw`(?:[^\s()]|\((?:[^\s()]|\([^\s()]*\))*\))*`
const named = String.raw`(?<!!)\[(?:\\.|[^\]\\\n])*\]\(https?:\/\/${destination}\)`
const bare = String.raw`https?:\/\/[^\s<>"\x60]+`
const links: TextMatchTransformer = {
  type: 'text-match', dependencies: [DescriptionLinkNode],
  importRegExp: new RegExp(`${named}|${bare}`, 'iu'),
  regExp: new RegExp(`(?:${named}|${bare}) $`, 'iu'),
  trigger: ' ',
  export: node => $isDescriptionLink(node) ? node.getTextContent() : null,
  replace: (node, match) => {
    if (node.hasFormat('code')) return
    const tokens = parseLinks(match[0]), token = tokens[0]
    if (!token || !('url' in token)) return
    const trailing = tokens.slice(1).map(token => 'text' in token ? token.text : token.label).join('')
    const source = match[0].slice(0, match[0].length - trailing.length)
    const link = $createDescriptionLink(token.url, token.named ? token.label.replace(/\\([\\\[\]])/gu, '$1') : null, source)
    node.replace(link)
    if (trailing) link.insertAfter($createTextNode(trailing))
  },
}

export function $linkifyDescription(): void {
  for (const text of $getRoot().getAllTextNodes()) {
    if (text.hasFormat('code') || text.getParents().some($isCodeNode)) continue
    let node = text, match: RegExpMatchArray | null
    while ((match = node.getTextContent().match(links.importRegExp!))) {
      const start = match.index ?? 0
      const pieces = node.splitText(start, start + match[0].length)
      const target = pieces[start === 0 ? 0 : 1]!
      links.replace!(target, match)
      const tail = pieces[start === 0 ? 1 : 2]
      if (!tail) break
      node = tail
    }
  }
}

export const descriptionTransformers: Transformer[] = [CODE, HEADING, QUOTE, CHECK_LIST, UNORDERED_LIST, ORDERED_LIST, ...TEXT_FORMAT_TRANSFORMERS, checklistShortcut, links, { ...links, trigger: ')', regExp: new RegExp(`${named}$`, 'iu') }]
