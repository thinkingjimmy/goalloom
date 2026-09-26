# Task link previews

## Product rules

Approved on 2026-09-26 from the Goalloom-styled interactive demo.

- Saving a task preserves its original text and URLs. Display-only parsing shortens bare HTTP(S) links to their source domain (YouTube has its familiar name), preserves named Markdown labels, and keeps surrounding text in order. Editing, export and undo use the original text.
- Public links show real page titles, descriptions and images where available. YouTube uses its official oEmbed metadata; X uses best-effort public post/article metadata. Missing, private, deleted, offline or unsupported pages retain a usable link. There is no embedded remote HTML or video player.
- One URL has one compact card. Multiple distinct URLs appear in source order in a horizontal snap strip with a next-card peek, count and Previous/Next buttons. No View all action, auto-rotation or new preference is introduced. Duplicate references remain in the sentence but share one preview.
- Clicking an inline link or card opens its original URL in the system browser. Clicking task text opens task details. Preview gestures never start task dragging or propagate horizontal overscroll to the board.
- Existing, completed, archived and past-period tasks receive the same presentation when viewed. No migration or save is required. Metadata never changes task versions, timestamps, status, history or undo receipts.
- Input remains plain text. Fetch starts only for saved content that becomes visible; preview work never delays creation. Item detail retains raw editable fields and previews saved title/description links.
- Card geometry is reserved during loading and failure. Single cards have no carousel controls. Keyboard focus, reduced motion, all five locales, light/dark and paper/minimal themes remain supported.

## Engineering contract

- `shared/links.ts` provides lightweight URL syntax normalization. The renderer does not import Zod.
- `shared/contracts/link-preview.ts` defines strict, bounded preview/open actions and inert metadata. Preload exposes only `getLinkPreview(url)` and `openExternal(url)`; main verifies the sole trusted window/main frame and revalidates arguments.
- `main/link-preview/` performs bounded public HTTP(S) requests with public-address validation, DNS pinning, redirect checks, timeouts, response-size limits, concurrency bounds and request deduplication. X/YouTube adapters use a separate credential-free in-memory Electron session for exact HTTPS embed endpoints and known image CDN paths, with redirects denied and normal certificate verification, so system proxy/fake-IP networks work for those providers. Arbitrary pages retain pinned public DNS; if a proxy hides their public address they fall back to a clickable link. No task body, browser cookie or credential is sent. Remote markup is never executed.
- Images cross the bridge as bounded raster data URLs. The existing renderer CSP and window navigation restrictions remain in force. Explicit external opening only accepts HTTP(S) without embedded credentials.
- Metadata/image cache is disposable, bounded device data under `userData/link-previews`, separate from SQLite, exports and backups. Cached successful metadata remains useful offline; failures expire to allow later recovery. Pending work is cancelled when the renderer session or workspace is replaced.
- Shared renderer link components handle parsing, visible-only requests, fixed-height cards and carousel interactions. Existing lists reuse them; task text remains the authoritative source. Virtual rows observe measured row sizes and include links in keyboard traversal.

## Failure cases and acceptance

Before implementation, identified failure cases: punctuation swallowed into URLs; nested clickable elements; user labels rewritten; duplicate cards; preview fetch delaying save; failed image collapsing rows; oversized/malformed metadata; unsafe schemes/credentials/private addresses and redirect/DNS rebinding; remote HTML execution; swallowed task/detail clicks; swipe starting drag; nested horizontal scroll; stale virtual offsets; cache growth; expired failures never recovering; cross-session responses surviving replacement; preview writes changing history; missing translations.

- [x] Mixed text, bare URLs and named links preserve order and raw editing.
- [x] Real X/YouTube/public OG metadata is supported with honest failure fallback.
- [x] Multiple cards support pointer/keyboard navigation, visible position, boundaries and task-drag isolation.
- [x] Historical, completed and archived tasks work without mutations; cache survives restart/offline use.
- [x] Main/preload URL and metadata boundaries reject unsafe requests; CSP remains unchanged.
- [x] Five-language copy, themes, focus and virtual rows remain usable.
- [x] Typecheck, existing Vitest suite and affected desktop scripts pass; repeatable JSON/screenshots document the scope.

Desktop validation uses isolated synthetic profiles. Controlled cached fixtures make UI checks repeatable; live-provider checks are reported separately and do not guarantee future provider availability. Windows and packaged-install acceptance remain separate from a macOS source Electron run.

[PROTOCOL]: Update this header when making changes, then check README.md.
