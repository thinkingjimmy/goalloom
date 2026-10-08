# assistance/

> L2 | Parent: [renderer](../../README.md)

INPUT: Task identity, generation, writing preferences, authoritative context and the detail autosave writer.
OUTPUT: Inline obstacle choices, cancellable note generation and one automatically applied, undoable Markdown rewrite. Settings enablement authorizes this request; opening the form is local-only.
POS: The task's working-notes area. The existing editor stays mounted and editable during generation. Results cannot overwrite changed drafts; pending write receipts lock editing until resolved.

Members:

- `AssistancePanel.tsx`: Action invitation, three obstacle choices plus custom input, bounded session drafts, local preflight, cancellation and a single Rethink action beneath the real editor.
- `GuidanceEditor.tsx`: Legacy guidance field presentation; not used by the rewrite flow.
- `assistance.css`: Shared product tokens, static controls, 44px choices and unframed notes without a result divider.

[PROTOCOL]: Update this header when making changes, then check README.md.
