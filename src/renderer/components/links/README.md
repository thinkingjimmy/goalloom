# links/

> Parent: [renderer](../../README.md). Saved-content presentation shared across item views.

- `parse.ts`: Lossless text and Markdown-link tokenization; shared URL validation, punctuation handling and ordered deduplication.
- `LinkText.tsx`: Shared favicon/page-title inline links, optional saved URL membership, safe external opening and an accessible sibling detail button without a duplicate-title tooltip or nested interactive elements.
- `cache.ts`: Synchronous warm-cache presentation, visible-only IPC refresh, request deduplication and bounded metadata caching.
- `LinkPreviews.tsx`: Fixed 128px cards and native horizontal snapping with localized keyboard and button controls.
- `links.css`: Naturally wrapping inline labels, product-token styling, clipped card images, carousel peek and checkbox-aligned previews with a compact title gap in current/past task rows.

INPUT: Saved text and the validated main-process preview contract. OUTPUT: Read-only rendering and explicit external-browser navigation. POS: Renderer presentation only; inputs, database content, versions, history and undo remain unchanged. The renderer makes no remote requests; image bytes arrive as validated data URLs. Unknown, offline, malformed or unavailable metadata retains a clickable source card with the same reserved height.

Ready cached cards render immediately when remounted, including expired entries while they refresh. A transient refresh failure retains successful content. Cold renderer starts still read the device cache asynchronously through IPC.

`InlineLink` also serves the Markdown description editor. `useLinkPreview(url, enabled)` gates requests by saved URL membership; draft-only URLs never start remote work. Cached title/favicon rendering is independent of editor state. Missing icons use the shared Hugeicons link glyph. Details use inline links only; cards remain on board/list/history surfaces.

Inline labels participate in normal sentence wrapping, including named links. Favicons stay with the first label character. Task titles and description links show all lines; neither the title nor the anchor imposes a line cap or ellipsis. Board task titles reserve checkbox space only on their first line; continuation lines align with the checkbox and preview cards.

`LinkText` accepts optional `savedUrls` to prevent draft-only destinations starting metadata requests. Board callers omit it because their text is already saved. Detail headings use the same unrestricted text renderer and provide a separate edit button.

`App` clears pending and cached presentation data on workspace generation changes; subscribed cards discard their previous local result, and late replies cannot populate the new generation. The main-process device cache remains reusable by URL.

[PROTOCOL]: Update this header when making changes, then check README.md.
