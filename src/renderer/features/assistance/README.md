# assistance/

> L2 | Parent: [renderer](../../README.md)

INPUT: Saved task identity, generation, device writing preferences, local preflight, purpose consent and the shared prepared writer.
OUTPUT: Bounded memory drafts, explicit cancellable generation, editable guidance/movement previews and one confirmed atomic command. Unknown receipts stay open.
POS: Subview inside the existing detail dialog. The description editor stays mounted; saved guidance and undo belong to the workspace.

Members:

- `AssistancePanel.tsx`: Intent-scoped titles/sessions/drafts, revisions, provider consent, exact periods, lifecycle/close guards and receipt recovery. Switching between help, guidance and scheduling remounts this subview while the task editor stays mounted; scheduling stays a local movement form.
- `GuidanceEditor.tsx`: Accessible bounded fields and the four plain guidance kinds.
- `assistance.css`: Existing surface tokens, form hierarchy, native checkbox sizing, guidance reading and coarse-pointer targets.

[PROTOCOL]: Update this header when making changes, then check README.md.
