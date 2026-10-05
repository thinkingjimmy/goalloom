# Task link previews

## Product rules

Approved on 2026-09-26 from the Goalloom-styled interactive demo.

- Saving a task preserves its authored text and URLs. Bare HTTP(S) links display favicon plus real page title, with a source-domain fallback while loading or unavailable. Named Markdown labels take priority. Title inputs, export and undo retain original text; rich descriptions retain Markdown source semantics.
- Inline links start in the current line's remaining space and wrap as part of the sentence. The containing task title grows to show every line; neither task text nor inline link labels are truncated. Favicons stay with the first character, and details allow multiline links.
- Hovering a task title does not show a duplicate title tooltip; the detail button retains its accessible name and keyboard activation.
- Public links show real page titles, descriptions and images where available. YouTube uses its official oEmbed metadata; X uses best-effort public post/article metadata. Missing, private, deleted, offline or unsupported pages retain a usable link. There is no embedded remote HTML or video player.
- One URL has one compact card. Multiple distinct URLs appear in source order in a horizontal snap strip with a next-card peek, count and Previous/Next buttons. No View all action, auto-rotation or new preference is introduced. Duplicate references remain in the sentence but share one preview.
- Clicking an inline link or card opens its original URL in the system browser. Clicking task text opens task details. Preview gestures never start task dragging or propagate horizontal overscroll to the board.
- Existing, completed, archived and past-period tasks receive the same presentation when viewed. No migration or save is required. Metadata never changes task versions, timestamps, status, history or undo receipts.
- Review records, goal headings, unfinished choices and plan sources use the same saved-title inline rendering with read-only task text. Independent external links open the source URL without filtering the board or closing the review. New plan inputs keep their authored source text.
- Detail titles display the complete text with naturally wrapping favicon/page-title links, using the same unrestricted rendering as the board. Clicking the title's text or edit affordance enters a growing plain-text field containing the original URLs; links open directly. Blur or Escape returns to the rendered title without discarding the draft; Enter retains title submission, and composition Enter never submits. Title editing keeps the 500-character limit and silent autosave and close-time draining. Unsaved destinations never request metadata. Descriptions use the [in-place Markdown editor](task-descriptions.md). Fetch starts only for saved content that becomes visible; preview work never delays creation. Details have no separate preview cards below the description, including title-only URLs; existing board/list/history cards remain.
- Raw detail-title editing has no bottom rule or focus shadow; the native caret marks the editing position.
- Title undo/redo survives rich/raw handoffs and autosave. After clearing a title and leaving editing, Cmd/Ctrl+Z from a detail control restores its native text history and returns focus to the title. Other focused text editors keep their own undo; workspace operations remain independent.
- Card geometry is reserved during loading and failure. Single cards have no carousel controls. Keyboard focus, reduced motion, all five locales, light/dark and paper/minimal themes remain supported.
- Board and past-period titles reserve checkbox space only on the first line; continuation lines return to the checkbox's left edge. The checkbox keeps its independent hit target above the expanded title. Preview cards share that left edge and retain a 5px gap below the title's text box; first-line indicators and the right edge stay aligned. Trailing relation ports and next-step rings/pills overlay content without narrowing titles or preview cards, including when hidden.
- Reopening a card with a successful renderer cache entry displays it on the first render, including stale content during background refresh. A cold application start reads its persisted cache asynchronously; a loading indicator alone does not imply a network request.

## Engineering contract

- `shared/links.ts` provides lightweight URL syntax normalization. The renderer does not import Zod.
- `shared/contracts/link-preview.ts` defines strict, bounded preview/open actions and inert metadata. Preload exposes only `getLinkPreview(url)` and `openExternal(url)`; main verifies the sole trusted window/main frame and revalidates arguments.
- `main/link-preview/` performs bounded public HTTP(S) requests with public-address validation, DNS pinning, redirect checks, timeouts, response-size limits, concurrency bounds and request deduplication. X/YouTube adapters use a separate credential-free in-memory Electron session for exact HTTPS embed endpoints and known image CDN paths, with redirects denied and normal certificate verification, so system proxy/fake-IP networks work for those providers. Arbitrary pages retain pinned public DNS; if a proxy hides their public address they fall back to a clickable link. No task body, browser cookie or credential is sent. Remote markup is never executed.
- Covers and nullable favicons cross the bridge as bounded data URLs. Generic icons use declared page links or the final origin's `/favicon.ico` through pinned public transport. X/YouTube use their exact official `/favicon.ico` endpoints through the isolated provider transport. Both paths enforce a four-second/256-KiB limit and PNG/JPEG/WebP or validated ICO payloads. No SVG or third-party favicon service is used. Old cache entries retain titles and covers while an independent, deduplicated icon check enriches them; failed checks have a 15-minute retry window and do not refresh the metadata timestamp. The existing renderer CSP and window navigation restrictions remain in force. Explicit external opening only accepts HTTP(S) without embedded credentials.
- Metadata/image cache is disposable, bounded device data under `userData/link-previews`, separate from SQLite, exports and backups. Cached successful metadata remains useful offline; failures expire to allow later recovery. Pending work is cancelled when the renderer session or workspace is replaced.
- Shared renderer link components handle parsing, visible-only requests, fixed-height cards and carousel interactions. Existing lists reuse them; task text remains the authoritative source. Virtual rows observe measured row sizes and include links in keyboard traversal.
- `DetailTitle` keeps its raw textarea mounted but hidden during rich reading, retaining Chromium's native text history. Empty-draft recovery captures only the native undo key from non-editor controls in the same detail dialog, focuses the title and invokes native undo before workspace shortcut dispatch. Save receipts do not replace that editor or its value.

## Failure cases and acceptance

Before implementation, identified failure cases: punctuation swallowed into URLs; nested clickable elements; user labels rewritten; duplicate cards; preview fetch delaying save; failed image collapsing rows; oversized/malformed metadata; unsafe schemes/credentials/private addresses and redirect/DNS rebinding; remote HTML execution; swallowed task/detail clicks; swipe starting drag; nested horizontal scroll; stale virtual offsets; cache growth; expired failures never recovering; cross-session responses surviving replacement; preview writes changing history; missing translations.

Review-title cases recorded before implementation: raw URLs remain in closing/record/plan titles; matrix links are nested inside its filter button; cached metadata changes stored titles or versions; link presentation disappears on step/session changes. Native first/last-day weekly fixtures reuse the production preview cache and assert source preservation in `tests/desktop/weekly-review.mjs`.

Regression cases recorded before the favicon/wrapping repair:

- An existing cached X post has a title and cover but no `favicon` field. Reopening it must enrich the icon without changing the saved task or discarding cached metadata; simultaneous requests must share work and offline failures must remain bounded.
- X/YouTube metadata succeeds through the isolated provider transport while the generic favicon path fails. Their official icon endpoints must use the same narrow provider boundary, with the same byte validation and no arbitrary-host exemption.
- A long fetched Chinese title follows short task prose. It must begin in the remaining line space, wrap naturally and remain fully visible beyond two lines. Long named links, multiple links and detail descriptions must remain clickable without overflow.
- A failed or missing icon must retain the link glyph and cached title; repeated rendering must not cause a request loop. Enriched icons must survive an offline restart, and session replacement must discard pending enrichment.

Detail-title cases recorded before implementation:

- A long plain or fetched title is clipped, limited to one/two lines, or pushes the completion/flow controls away from its first line. Reading and editing must both wrap within the dialog and allow the full text to be reached.
- Opening details exposes raw URLs instead of the shared rich links, changes source/history, or requests metadata for an unsaved URL after blur.
- A link click enters editing or an edit action opens a browser; a URL-only title becomes impossible to edit. Keyboard activation and Escape must preserve useful focus without closing the dialog or losing drafts.
- Switching between rendered text and raw editing rewrites authored labels/URLs, loses continued typing during a save receipt, submits during composition, or makes a deleted item editable.
- A pointer blur changes the title's height before mouseup, moving property controls away from the click. The edit/read layout handoff must wait until the pointer action has completed; keyboard blur can switch immediately.
- Clearing a title, leaving raw editing and reopening it loses native undo history. Cmd/Ctrl+Z must restore the authored text, including after autosave validation or a blocked close; redo remains available while editing. An invalid title's recovery must not undo an unrelated workspace operation or alter a description's own text history.

- [x] Mixed text, bare URLs and named links preserve order and raw editing.
- [x] Detail titles show every line with shared favicon/page-title links; explicit raw editing preserves drafts, composition, autosave and read-only states.
- [x] Native title undo/redo survives autosave and rich/raw handoffs; empty-title recovery after blur, Escape or blocked close preserves description history and the workspace undo stack. Reproduce with `node tests/desktop/link-previews.mjs --titles`; JSON and before/after screenshots live in `output/tests/link-previews/titles/`.
- [x] Real X/YouTube/public OG metadata is supported with honest failure fallback.
- [x] Multiple cards support pointer/keyboard navigation, visible position, boundaries and task-drag isolation.
- [x] Historical, completed and archived tasks work without mutations; cache survives restart/offline use.
- [x] Review closing/plan/goal titles share cached page-title rendering without replacing authored URLs. The initial filter/title actions verified in `output/tests/review-controls/report.json` were superseded by the owner's read-only clarification; independent URL links remain supported.
- [x] Main/preload URL and metadata boundaries reject unsafe requests; CSP remains unchanged.
- [x] Five-language copy, themes, focus and virtual rows remain usable.
- [x] Typecheck, existing Vitest suite and affected desktop scripts pass; repeatable JSON/screenshots document the scope.

Desktop validation uses isolated synthetic profiles. Controlled cached fixtures make UI checks repeatable; live-provider checks are reported separately and do not guarantee future provider availability. Windows and packaged-install acceptance remain separate from a macOS source Electron run.

[PROTOCOL]: Update this header when making changes, then check README.md.
