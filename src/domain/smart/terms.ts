/**
 * [INPUT]: The user's source text and one existing item title.
 * [OUTPUT]: sharedTermText: the longest distinctive term both contain (Latin word ≥4 letters or CJK run ≥4 chars) or null; sharedTerm: its length, 0 if none.
 * [POS]: Deterministic candidate discovery for smart input; decides which goals Jev may see, never whether they are parents.
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
