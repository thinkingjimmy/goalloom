# Task descriptions

## Product rules

- Descriptions edit in place with Markdown shortcuts and retain Markdown strings in the existing item field. Opening, selecting text and resolving metadata never save or dirty an item.
- Details use a permanent side rail. Activity stays above the visible cancel, archive and delete controls; deleted items keep read-only activity and their existing restore action. The property row combines the deadline with one flow chip: a parent label, a root color dot or a join-flow action. These controls keep the existing guarded writes.
- The activity rail scales with the detail width. Property controls stay inside the editor at native narrow sizes and zoomed text. Truncated date labels keep their full accessible name and hover text.
- Every task uses the same facts/help/month-calendar rail. Carryovers, advance changes, actual scheduled todo duration, current episodes and pressure come from the authoritative query. Day/all activity is cursor-paged and retains undone records. See [smart assistance](Goalloom-Smart-Assistance-PRD-TODO-v1.1.md) for the new metric rules; activity reads never write.
- The empty prompt and input share font and line metrics. Typing starts on the prompt's baseline, including compact windows and zoomed text; the multiline editor keeps its full-height area. In a detail, the focused fill is the field edge: the prompt and caret sit inside it, while the text column stays aligned with the property row.
- Support paragraphs, line breaks, headings, nested ordered/unordered lists, Markdown task lists (`- [ ]` / `- [x]`, including uppercase `X`), emphasis, strike, quotes, inline/fenced code and safe HTTP(S) links. Task-list checkboxes immediately autosave the description; they never change the owning item's completion or create subtask records. Unsupported syntax remains text. No attachments or tables are introduced.
- Details save silently: title/description typing debounces for 500ms; blur, deadline selection/clear and checklist toggles flush immediately. No Save/Discard footer or success Toast. Closing, related-item navigation and decompose drain pending edits first. Enter/submit still flushes and ends editing. Editor undo owns text while focused; persistence never resets its history or selection. Composition defers writes until it ends. Deleted items render read-only; titles remain required and at most 500 characters, serialized Markdown at most 100,000 characters.
- Save failures and invalid input retain the detail and draft with a localized inline error and Retry. Unknown outcomes resolve the original receipt before any new operation. Native window close/quit drains detail edits before continuing; a failed drain keeps the window and storage alive. Composer drafts retain their explicit confirmation. No persistent draft or crash-recovery subsystem is introduced.
- Closing a detail whose title is empty/whitespace removes a title-only todo without confirmation or a trash entry. Both the current draft and authoritative item must have no non-blank description, active guidance, deadline, flow color, active relation, completion/cancellation or archive state. A single workspace undo restores the last saved title and unchanged placement/order; text undo remains available until closure. Clearing/retyping, navigation and native window close/quit do not discard an item. Failure retains the detail, and Retry resolves the original discard receipt before closing. Approved by the owner on 2026-10-05.
- Bare links display cached page titles and favicons; named links retain authored labels. Code stays literal. New destinations request metadata only after saving. Metadata is presentation, never document content.
- Inline titles and named links wrap within the surrounding paragraph; the link itself never applies a width cap or ellipsis. Missing legacy icons are enriched without changing Markdown or editor history.
- Details have no separate preview cards. Existing board cards remain.
- Board rows use the selected "signal + peek" presentation (D5). A row with a non-blank description shows one quiet line under its title, before any title link cards: checklist progress with the first open item, otherwise the first plain line; plus the first link host and `+N` for further links. Code spans and fenced blocks never count as checklist items or links. Rows without a description or guidance keep their height. An optional guidance signal shares the same position; original checklist/description priority stays. Completed rows show the signal faded.
- Hovering the signal for 300ms, focusing it or pressing it opens a floating, read-only peek beside the row with the full Markdown note and its link cards. Peek checklist markers never write; editing and autosave stay in the detail. Leaving the signal and peek, Escape or an outside press closes it. Pressing the signal never drags the row or opens the detail.
- Item summaries carry only the bounded digest (`note`: tasks done/total, next item ≤120 chars, up to three link URLs with a total, excerpt ≤120 chars), computed in storage; the description body loads only when a peek or detail opens.
- The surrounding detail title reads as complete rich text and switches to growing raw-text editing on demand; its shared link/source and draft rules are defined in [link previews](link-previews.md).
- Selection tools stay clear of the selected text, prefer the space above it and flip below when needed. Placement uses the measured toolbar/link-form size and tracks scrolling and resizing within the visible detail area.

Independent guidance never overwrites Markdown. The detail retains the mounted editor while help is open, flushes before entry, and uses a dedicated reversible command for adopted guidance. Saved guidance remains available with AI disabled.

## Failure cases recorded before implementation

Autosave regression cases recorded before implementation (2026-09-29):

- Debounced typing, blur, checklist toggles or deadline changes never reach storage; closing, navigating or quitting loses the final change.
- A delayed receipt replaces newer input, resets selection/local undo, trims a title mid-word or writes the same draft repeatedly. Composition writes unfinished text.
- Concurrent detail actions use a stale item version; an external update overwrites dirty fields or an old workspace timer writes into a replacement workspace.
- Failed/unknown writes close the detail or lose its draft; retry creates a new operation before resolving the original receipt. Invalid titles or oversized Markdown persist silently.
- An unknown write later fails definitively, but a second retry incorrectly advances the draft baseline without a committed receipt; retry failure also hides the global error for non-detail writes.
- Native close loops or quits after failed persistence; cancelling a composer draft closes storage; successful autosave shows a Toast or fetches metadata before commit.
- Empty-title closure discards while typing, creates a trash entry/count or leaves a deleted live past-period row. Undo must restore the original saved title, identity and placement in one step without undoing an older action.
- A description/deadline in either the draft or stored item, a relation in either direction, a flow color or a done/cancelled/archived state is lost by empty-title closure. The authoritative transaction must reject stale versions, generations and newly added content without partial writes.
- An in-flight edit is bypassed by discard, a failed/unknown discard closes the detail, or retry duplicates deletion. A successful retry must close the detail and preserve exactly one undo entry; typing is locked only once discard is submitted. Regular deletion still enters trash, and discard records must survive validated JSON/SQLite recovery while remaining outside trash.
- An imported discard marker hides meaningful content or claims to have removed relationships. Import must reject such records; undoing a legitimate discard and adding content later must remain valid.
- Save receipt updates mutate Lexical content/history; pure opening, formatting selection or link metadata causes a write.

- Opening or importing Markdown marks an unchanged description dirty; changing only the title rewrites description bytes; undo back to the initial document still dirties it.
- List shortcuts, nesting, continuation and exit fail; composition Enter submits; editor undo triggers workspace undo; formatting loses the selection.
- A delayed save or unrelated revision replaces newer typing; retry leaves stale editor state; switching items leaks the old document.
- Unsupported syntax, angle brackets, blank lines, link punctuation, custom labels or code URLs are lost in import/export; pasted HTML executes or loads remote resources.
- Link labels or favicons change the stored text, local undo or item history; drafts request metadata; copying a link copies only fetched title; removing a link loses adjacent text.
- Favicon responses are oversized, malformed, private, redirected unsafely or SVG; icon errors discard otherwise usable metadata; existing cache records fail without the new field.
- Selection tools escape the dialog, steal composition focus, overlap content, or lack translated accessible names; long text exceeds bounds; deleted items become editable.
- Inline link metadata changes row heights without virtual measurement; link clicks start dragging or open details.

Task-list regression cases recorded before implementation:

- Existing unchecked/checked/uppercase markers render as ordinary bullets or text; nested items lose their state; code examples are incorrectly converted to controls. Opening must preserve the exact source and clean state.
- Typing `- [ ] ` after the ordinary-list shortcut fails, converts neighboring ordinary bullets into tasks, Enter repeats a checked state, indentation loses content, or Enter on an empty item cannot exit the list.
- Pointer/keyboard toggles fail to autosave, complete the parent item, break local undo/redo, or remain active in deleted/read-only descriptions. Clicking text or links must not toggle a marker.
- Saving, reopening, copying or pasting drops checkbox markers/states, authored formatting or link destinations; local undo fails to restore them. Long labels and nested controls must remain aligned in both themes/styles.

Selection-tool positioning regression cases recorded before implementation:

- Selecting the first few characters clamps the toolbar to the editor's top and covers the selection. A multiline selection, right-edge selection or taller link form can also collide when placement assumes a fixed size.
- Scrolling leaves tools at stale coordinates or over the dialog header/footer; a selection outside the visible text area leaves an orphaned toolbar. Resizing and changing panel size must recompute placement without moving the editor or writing a draft.
- Moving focus into the link form loses the saved anchor; formatting/cancel/Escape changes the wrong text, closes the detail, dirties a clean note or breaks local undo.

First-line typography regression cases recorded before implementation (2026-10-03):

- Empty placeholder and typed first character use different line metrics, shifting the baseline when typing begins. Locale, theme or zoom changes must not reintroduce the drift.
- The detail placeholder or caret sits on the focused fill's left edge.
- A fixed activity rail leaves too little editor space at 720px and 150% zoom; long translated property controls force horizontal scrolling. Keep the side rail responsive, constrain the property controls and retain full accessible labels.
- Adjusting the placeholder collapses the full-height editor or makes pure focus/selection dirty an empty description.

Detail-rail regression cases: actions or history are clipped at 720px, the rail overlaps the editor, flow choices lose their hints or candidate guards, reading the summary changes an item, undo records inflate the summary, and deleted-item details expose lifecycle writes. Keep native geometry, lifecycle and restored-data evidence in the owning workspace/history/feedback scenarios.

## Acceptance

- [x] Empty-title detail closure removes only title-only todos, keeps trash clean and restores the saved title/placement with one undo; failure, receipt, race and recovery cases have repeatable desktop evidence in `output/tests/autosave/discard/` and the full `output/tests/autosave/` reports.
- [x] Empty prompts and typed first glyphs share the same baseline/inset across five locales, four themes and normal/150% zoom, while retaining full editor height and read-only focus.
- [x] Silent autosave, pending-input drains, receipt/failure recovery and native close/quit pass the isolated desktop autosave scenarios.

- [x] Desktop E2E covers editing, serialization, persistence, undo/redo, composition-Enter protection and saved-only links with repeatable reports/screenshots.
- [x] Markdown task lists render and edit in place, retaining nested states, literal code, clipboard/source semantics and read-only guards; task-list shortcuts preserve neighboring ordinary bullets.
- [x] Selection tools clear first-line, multiline and right-edge selections, follow scroll/resize, flip at visible boundaries and retain link-form anchors without dirtying source.
- [x] Existing owning UI, link, language, renderer-race and virtual-row coverage passes.
- [x] Three working homepage alternatives and the existing baseline are available locally with repeatable visual evidence.

## Engineering and reproduction

Lexical 0.51.0 loads with `ItemDetail`; the initial board does not import the editor. The controlled adapter compares canonical Markdown for change detection while retaining untouched source bytes. `CHECK_LIST` precedes ordinary bullet import, and `CheckListExtension` owns pointer/keyboard state. A text shortcut converts `[ ] ` / `[x] ` after the initial bullet shortcut, splitting only the current item so neighboring bullets and nesting survive. Markers use the bundled Hugeicons check glyph through a CSS mask. Blur checkpoints split local undo groups; autosave receipts never alter Lexical history. Link decorator nodes store only authored URL, label and source; React metadata updates cannot alter editor state. Clipboard input is plain Markdown, never HTML. The existing write transaction and 100,000-character string contract remain authoritative; no database migration or production summary-body query was added.

Autosave is owned by `features/items/use-item-autosave.ts`. The workspace writer reserves the write slot before reading versions; clean fields merge from authoritative reads while local dirty fields survive refresh. Receipts advance only the submitted baseline. The narrow native close handshake is token-bound to the trusted main frame; it carries no task content. `pnpm test:autosave` writes its report/screenshots under `output/tests/autosave/`.

Explicit detail dismissal serializes with pending actions/autosave and sends `discardEmpty` only after fresh item/draft checks. The write transaction revalidates `domain/items.canDiscardEmptyTitle`, versions and active relations. It retains the saved title/placement and uses the existing visibility effect/session undo. The deletion receipt's kind excludes the item from trash counts/lists and live past-period tasks; immutable history and backups retain the recovery record. No schema change or second undo stack is added. `node tests/desktop/autosave.mjs --discard` reproduces native undo/guards/failure cases plus clock-injected production JSON/SQLite recovery under `output/tests/autosave/discard/`.

Run the feature-owned commands in the [test map](../development.md#测试范围). Native editing evidence lives in `output/tests/descriptions/`; link transport/cache evidence in `output/tests/link-previews/`; renderer/virtual reports in `output/tests/review-fixes/`. Composition events are simulated; these runs do not claim a physical input-method session or Windows/packaged acceptance.

`node tests/desktop/descriptions.mjs --alignment` measures empty/typed first-glyph geometry across five locales, four themes, native large/compact windows and 100%/150% zoom. The shared editor container owns line-height so the absolutely positioned placeholder and editable first paragraph stay on the same baseline. The same run checks that the focused detail fill keeps the placeholder inside its edge. Reports and screenshots live in `output/tests/descriptions/alignment/`; full description acceptance includes these scenarios.

Selection tools retain a DOM range while the link form owns focus and render in the native dialog's floating layer. Placement measures the current panel against visible clipping ancestors, follows scroll/resize/content changes and hides when its selection leaves view. It does not clamp tools into the description's first line or alter editor layout. `node tests/desktop/descriptions.mjs --selection-tools` reproduces the native geometry and selection-semantics cases with evidence in `output/tests/descriptions/selection-tools/`.

The private harness starts with `node output/prototypes/descriptions/serve.mjs` at `http://127.0.0.1:5178/`; keys 1–4 switch baseline, persistent summary, expandable summary and nearby preview. `node output/prototypes/descriptions/verify.mjs` reproduces the theme/density/keyboard evidence in `output/tests/description-prototypes/`.

The user selected the persistent-summary interaction for further visual refinement on 2026-09-28. The second round at `http://127.0.0.1:5178/refinements/?v=1` keeps its original appearance as the baseline and adds reading text, margin notes and inset notes. No final style has been selected or integrated. `node output/prototypes/descriptions/refinements/verify.mjs` reproduces its browser checks; `--compact` selects compact-window coverage. Reports and screenshots live in `output/tests/persistent-summary-refinements/`. The first-round comparison remains available.

[PROTOCOL]: Update this header when making changes, then check README.md.
