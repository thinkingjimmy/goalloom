# links/

> Parent: [renderer](../../README.md). Saved-content presentation shared across item views.

- `parse.ts`: Lossless text and Markdown-link tokenization; shared URL validation, punctuation handling and ordered deduplication.
- `LinkText.tsx`: Inline source labels, named anchors, safe external opening and a sibling detail button without nested interactive elements.
- `cache.ts`: Synchronous warm-cache presentation, visible-only IPC refresh, request deduplication and bounded metadata caching.
- `LinkPreviews.tsx`: Fixed 128px cards and native horizontal snapping with localized keyboard and button controls.
- `links.css`: Product-token styling, clipped card images, carousel peek and per-surface alignment.

INPUT: Saved text and the validated main-process preview contract. OUTPUT: Read-only rendering and explicit external-browser navigation. POS: Renderer presentation only; inputs, database content, versions, history and undo remain unchanged. The renderer makes no remote requests; image bytes arrive as validated data URLs. Unknown, offline, malformed or unavailable metadata retains a clickable source card with the same reserved height.

Ready cached cards render immediately when remounted, including expired entries while they refresh. A transient refresh failure retains successful content. Cold renderer starts still read the device cache asynchronously through IPC.

`App` clears pending and cached presentation data on workspace generation changes; subscribed cards discard their previous local result, and late replies cannot populate the new generation. The main-process device cache remains reusable by URL.

[PROTOCOL]: Update this header when making changes, then check README.md.
