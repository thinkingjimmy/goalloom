# 二级 todo

> Independent tasks grouped into an always-expanded, two-level outline. Goal links remain a separate graph.

## Product rules

- Drop a leaf task on the middle of a root row to nest it; move it to the root's horizon/period and append it. Row edges reorder. Keep the 6px drag threshold and use a 24px indent. The nesting hot zone covers the central vertical area (16px margins from top/bottom) and the left 60% of the row width (at least 200px), focusing the gesture on the title/indent area while keeping edge reordering clear.
- A root with children cannot be nested. A nested task cannot receive nested children. Keyboard menus provide equivalent nest/unnest actions.
- Successful nesting stays quiet for drag, menu and recovered receipts. Keep keyboard/command undo and its confirmation, plus existing failure feedback.
- The selector searches current, future and Later tasks, including periods outside the displayed board. Expired or changed targets are rejected.
- Nested tasks inherit all current goal parents and flow colors from their root. Their own outgoing goal links, text, dates and lifecycle remain independent.
- Keep each outline in its sorted position by default, including completed members. With completed folding enabled, keep a group in the todo section while any visible member is todo; otherwise show it in completed. Hidden roots retain a two-line context with a visible lifecycle label above their children. Details show the complete container name. See [completed-task layout](completion-feedback.md#已完成任务显示).
- Root moves and period rollover move the complete live group without changing status timestamps. A current-period hold on any unfinished member blocks automatic group rollover.
- Moving a child out of its group makes it independent. Unnesting or deleting the root materializes its current inherited goal parents; a colored root with no goal parents leaves detached children colorless.
- Delete only the selected task. Undo restores owned fields and relations atomically without overwriting later text/status edits. Item restore never steals moved or reparented children.
- Later supports nesting but has no flow colors or new goal links. Past periods retain the outline and existing lifecycle/detail actions.

## Engineering contract

- Schema/dataset v10: optional legacy/default-null placement nesting parent, body-free hierarchy history and v3 owned nesting effects. v10 sits on the Phase 0 v9 chain and mirrors the column and triggers onto `base_*`. v8 and Phase 0 v9 upgrade in place after a protective backup; v1–v7 keep the verified protective-copy and explicit-confirmation workflow. `nest` / `unnest` map to SyncOp `item.nest` (placement dimension, plus relation and color actions in the same op).
- Nesting and explicit goal links are distinct. Shared effective-topology rules drive flow membership, relation rendering, ordering, queries and AI context. Validate cycles in their combined graph inside authoritative writes and import.
- Nest/unnest are finite generation/version-guarded commands. Their placement, incoming-link and color changes share one receipt. Existing inherited links materialized on detach retain their source provenance.
- Root ordering precedes child ordering. Flatten groups into the existing virtual list; preserve task identity, drafts, focus and scroll.
- All user-visible copy is translated into Chinese, English, Japanese, Spanish and French.

## Failure cases recorded before implementation

- Middle-row drops reorder instead of nesting; edge drops nest accidentally; invalid/hidden/history targets write; cancellation or a stale generation leaves an outline preview.
- Nesting changes text/status/due dates, loses outgoing links, keeps old incoming links/colors or allows a third level.
- Inherited parents/colors become stale; a goal edge and nesting edge form a cycle; inherited edges are editable on a child or counted as an additional task.
- Mixed-status groups split apart, archived/cancelled roots hide active children, or virtual rows lose focus and geometry.
- Group moves/rollover run twice, partially commit, change completion timestamps or ignore an unfinished member's hold.
- Unnest/delete loses inherited parents, children or their outgoing links; restore steals independently moved/reparented children.
- Undo overwrites unrelated edits, restores an occupied color, skips a dependency guard, partially reverses a group or loses expired-period holds. New standalone colors or goal parents after departure must produce a definitive conflict before re-nesting.
- JSON/SQLite restore loses nesting/provenance, accepts invalid parents/placements/cycles or forged effects; legacy upgrade mutates the original database before confirmation.
- Retry duplicates a write, unknown outcomes lose the receipt, language switching leaves untranslated copy or reduced motion still animates.
- A cleared title silently discards a root or child with outline dependencies; inherited information has no readable popover surface; future search is limited to the displayed period.
- An archived/completed container adds a required AI dependency beyond the bounded context limit; completed relationships inflate visible omission counts.

## Acceptance

- [x] Native Electron gestures, keyboard menus, detail edits, inheritance, independent children and mixed statuses.
- [x] Transactions, group moves/rollover/hold, deletion/restoration, scoped undo, restart and failed/unknown receipts.
- [x] JSON/SQLite round trips, invalid imports and protected legacy upgrade.
- [x] Typecheck, existing Vitest and affected-feature E2E; repeatable reports/screenshots under `output/tests/subtasks/`.
- [ ] Owner Windows 11 and packaged acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
