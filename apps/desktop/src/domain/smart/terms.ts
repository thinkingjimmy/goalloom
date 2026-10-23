/**
 * [INPUT]: The user's source text and one existing item title.
 * [OUTPUT]: Shared distinctive terms and exact, negation-aware goal-link/ownership reference checks.
 * [POS]: Lightweight text helpers; lexical overlap never decides automatic goal membership.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const latin = /[A-Za-z][A-Za-z0-9+#.-]{3,}/g
const cjk = /[\u3400-\u9fff]{4,}/g

export function sharedTermText(text: string, title: string): string | null {
  let best: string | null = null
  const source = text.toLowerCase()
  for (const word of title.match(latin) ?? []) if (source.includes(word.toLowerCase()) && word.length > (best?.length ?? 0)) best = word
  // Longest common CJK run of at least four characters, e.g. 「远端控制」 in both.
  for (const run of title.match(cjk) ?? []) {
    for (let size = run.length; size >= 4 && size > (best?.length ?? 0); size--) {
      const found = Array.from({ length: run.length - size + 1 }, (_, start) => run.slice(start, start + size)).find(piece => text.includes(piece))
      if (found) { best = found; break }
    }
  }
  return best
}
export function sharedTerm(text: string, title: string): number { return sharedTermText(text, title)?.length ?? 0 }
export function explicitlyReferences(text: string, title: string): boolean {
  return references(text, title, '关联|属于|归入|归到|加入|挂到|\\blink\\s+to|\\bput\\s+under')
}
export function explicitlyOwns(text: string, title: string): boolean {
  return references(text, title, '属于|归入|归到|加入|挂到|\\bput\\s+under')
}
function references(text: string, title: string, verbs: string): boolean {
  const prose = text.replace(/https?:\/\/[^\s<>「」“”]+/g, ' ')
  const pattern = new RegExp(`(?:${verbs})\\s*[「『“"']?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[」』”"'\\s，,。；;.!?])`, 'gi')
  return [...prose.matchAll(pattern)].some(match => {
    const prefix = prose.slice(Math.max(0, match.index - 24), match.index).split(/[，,。.!?;；\n]/).at(-1) ?? ''
    return !/(?:不|未|无|没有|无需|拒绝|别|勿).{0,8}$|(?:do\s+not|don't|not|never)\s+(?:\w+\s+){0,3}$/i.test(prefix)
  })
}
