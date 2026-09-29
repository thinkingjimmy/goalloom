# description/

> Parent: [renderer](../../README.md). Markdown descriptions with in-place editing.

- `DescriptionEditor.tsx`: Lazy Lexical detail editor, native task-list interactions, source-preserving controlled adapter, whole-document/partial Markdown paste, blur history boundaries and immediate checklist callbacks and composition guards.
- `markdown.ts`: Explicit supported Markdown transforms, task lists before ordinary bullets, typed/blurred URL conversion and lossless URL tokens; code remains literal.
- `DescriptionLink.tsx`: Inline immutable URL nodes rendered with shared metadata; authored source is independent of resolved labels.
- `SelectionTools.tsx`: Selection formatting and link editing with a preserved anchor, portaled into the owning dialog.
- `selection-position.ts`: Measured panel placement above/below the selected text within visible scroll bounds, updated on scroll/resize/content changes.
- `description.css`: Token-based reading, editing, Hugeicons checkbox markers and selection-tool styling.

INPUT: Draft Markdown, saved URL membership, read-only state and a draft callback. OUTPUT: User-authored Markdown changes, never metadata writes. POS: Presentation boundary; the item detail owns saving, lifecycle and revision guards. Task-list pointer/keyboard toggles use Lexical's local undo and the detail autosave, without creating items or changing their completion. Read-only descriptions keep the markers but reject toggles. Blur separates local undo groups without clearing prior history; autosave receipts do not reimport content or alter undo groups. Unsupported text remains inert; pasted HTML and files are never executed or fetched.

Selection tools measure both the compact bar and expanded link form. Their fixed dialog layer escapes editor clipping while respecting the visible detail scroll area; an off-screen selection hides the tools. Placement never changes the editor layout, selection or Markdown.

[PROTOCOL]: Update this header when making changes, then check README.md.
