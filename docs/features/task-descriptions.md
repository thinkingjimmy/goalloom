# Task descriptions

## Product rules

- Descriptions edit in place with Markdown shortcuts and retain Markdown strings in the existing item field. Opening, selecting text and resolving metadata never save or dirty an item.
- Support paragraphs, line breaks, headings, nested ordered/unordered lists, Markdown task lists (`- [ ]` / `- [x]`, including uppercase `X`), emphasis, strike, quotes, inline/fenced code and safe HTTP(S) links. Task-list checkboxes edit the description draft through the same Save/Discard flow; they never change the owning item's completion or create subtask records. Unsupported syntax remains text. No attachments or tables are introduced.
- Keep explicit Save/Discard and the existing draft/receipt guards. Editor undo owns text while focused. Composition never submits. Deleted items render read-only. Serialized Markdown is limited to 100,000 characters.
- Bare links display cached page titles and favicons; named links retain authored labels. Code stays literal. New destinations request metadata only after saving. Metadata is presentation, never document content.
- Inline titles and named links wrap within the surrounding paragraph; the link itself never applies a width cap or ellipsis. Missing legacy icons are enriched without changing Markdown or editor history.
- Details have no separate preview cards. Existing board cards remain.
- Board rows use the selected "signal + peek" presentation (D5). A row with a non-blank description shows one quiet line under its title, before any title link cards: checklist progress with the first open item, otherwise the first plain line; plus the first link host and `+N` for further links. Code spans and fenced blocks never count as checklist items or links. Rows without a description keep their height. Completed rows show the signal faded.
- Hovering the signal for 300ms, focusing it or pressing it opens a floating, read-only peek beside the row with the full Markdown note and its link cards. Peek checklist markers never write; editing and Save/Discard stay in the detail. Leaving the signal and peek, Escape or an outside press closes it. Pressing the signal never drags the row or opens the detail.
- Item summaries carry only the bounded digest (`note`: tasks done/total, next item ≤120 chars, up to three link URLs with a total, excerpt ≤120 chars), computed in storage; the description body loads only when a peek or detail opens.
- The surrounding detail title reads as complete rich text and switches to growing raw-text editing on demand; its shared link/source and draft rules are defined in [link previews](link-previews.md).
- Selection tools stay clear of the selected text, prefer the space above it and flip below when needed. Placement uses the measured toolbar/link-form size and tracks scrolling and resizing within the visible detail area.

## Failure cases recorded before implementation

- Opening or importing Markdown marks an unchanged description dirty; changing only the title rewrites description bytes; undo back to the initial document still dirties it.
- List shortcuts, nesting, continuation and exit fail; composition Enter submits; editor undo triggers workspace undo; formatting loses the selection.
- A delayed save or unrelated revision replaces newer typing; Discard leaves stale editor state; switching items leaks the old document.
- Unsupported syntax, angle brackets, blank lines, link punctuation, custom labels or code URLs are lost in import/export; pasted HTML executes or loads remote resources.
- Link labels or favicons change the stored text, local undo or item history; drafts request metadata; copying a link copies only fetched title; removing a link loses adjacent text.
- Favicon responses are oversized, malformed, private, redirected unsafely or SVG; icon errors discard otherwise usable metadata; existing cache records fail without the new field.
- Selection tools escape the dialog, steal composition focus, overlap content, or lack translated accessible names; long text exceeds bounds; deleted items become editable.
- Inline link metadata changes row heights without virtual measurement; link clicks start dragging or open details.

Task-list regression cases recorded before implementation:

- Existing unchecked/checked/uppercase markers render as ordinary bullets or text; nested items lose their state; code examples are incorrectly converted to controls. Opening must preserve the exact source and clean state.
- Typing `- [ ] ` after the ordinary-list shortcut fails, converts neighboring ordinary bullets into tasks, Enter repeats a checked state, indentation loses content, or Enter on an empty item cannot exit the list.
- Pointer/keyboard toggles write immediately, complete the parent item, break local undo/redo, or remain active in deleted/read-only descriptions. Clicking text or links must not toggle a marker.
- Saving, reopening, copying or pasting drops checkbox markers/states, authored formatting or link destinations; Discard fails to restore them. Long labels and nested controls must remain aligned in both themes/styles.

Selection-tool positioning regression cases recorded before implementation:

- Selecting the first few characters clamps the toolbar to the editor's top and covers the selection. A multiline selection, right-edge selection or taller link form can also collide when placement assumes a fixed size.
- Scrolling leaves tools at stale coordinates or over the dialog header/footer; a selection outside the visible text area leaves an orphaned toolbar. Resizing and changing panel size must recompute placement without moving the editor or writing a draft.
- Moving focus into the link form loses the saved anchor; formatting/cancel/Escape changes the wrong text, closes the detail, dirties a clean note or breaks local undo.

## Acceptance

- [x] Desktop E2E covers editing, serialization, save/discard, undo/redo, composition-Enter protection and saved-only links with repeatable reports/screenshots.
- [x] Markdown task lists render and edit in place, retaining nested states, literal code, clipboard/source semantics and read-only guards; task-list shortcuts preserve neighboring ordinary bullets.
- [x] Selection tools clear first-line, multiline and right-edge selections, follow scroll/resize, flip at visible boundaries and retain link-form anchors without dirtying source.
- [x] Existing owning UI, link, language, renderer-race and virtual-row coverage passes.
- [x] Three working homepage alternatives and the existing baseline are available locally with repeatable visual evidence.

## Engineering and reproduction

Lexical 0.51.0 loads with `ItemDetail`; the initial board does not import the editor. The controlled adapter compares canonical Markdown for change detection while retaining untouched source bytes. `CHECK_LIST` precedes ordinary bullet import, and `CheckListExtension` owns pointer/keyboard state. A text shortcut converts `[ ] ` / `[x] ` after the initial bullet shortcut, splitting only the current item so neighboring bullets and nesting survive. Markers use the bundled Hugeicons check glyph through a CSS mask. Saved-source/blur checkpoints split local undo groups. Link decorator nodes store only authored URL, label and source; React metadata updates cannot alter editor state. Clipboard input is plain Markdown, never HTML. The existing explicit write transaction and 100,000-character string contract remain authoritative; no database migration or production summary-body query was added.

Run the feature-owned commands in the [test map](../development.md#测试范围). Native editing evidence lives in `output/tests/descriptions/`; link transport/cache evidence in `output/tests/link-previews/`; renderer/virtual reports in `output/tests/review-fixes/`. Composition events are simulated; these runs do not claim a physical input-method session or Windows/packaged acceptance.

Selection tools retain a DOM range while the link form owns focus and render in the native dialog's floating layer. Placement measures the current panel against visible clipping ancestors, follows scroll/resize/content changes and hides when its selection leaves view. It does not clamp tools into the description's first line or alter editor layout. `node tests/desktop/descriptions.mjs --selection-tools` reproduces the native geometry and selection-semantics cases with evidence in `output/tests/descriptions/selection-tools/`.

The private harness starts with `node output/prototypes/descriptions/serve.mjs` at `http://127.0.0.1:5178/`; keys 1–4 switch baseline, persistent summary, expandable summary and nearby preview. `node output/prototypes/descriptions/verify.mjs` reproduces the theme/density/keyboard evidence in `output/tests/description-prototypes/`.

The user selected the persistent-summary interaction for further visual refinement on 2026-09-28. The second round at `http://127.0.0.1:5178/refinements/?v=1` keeps its original appearance as the baseline and adds reading text, margin notes and inset notes. No final style has been selected or integrated. `node output/prototypes/descriptions/refinements/verify.mjs` reproduces its browser checks; `--compact` selects compact-window coverage. Reports and screenshots live in `output/tests/persistent-summary-refinements/`. The first-round comparison remains available.

[PROTOCOL]: Update this header when making changes, then check README.md.
