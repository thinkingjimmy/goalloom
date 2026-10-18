# 二级 todo

> Independent tasks grouped into an always-expanded, two-level outline. Goal links remain a separate graph.

## Product rules

- Drop a leaf task on the middle of a root or any of its children to join that root's horizon/period at the end. One border encloses the complete displayed group. A middle drop within the same group leaves its order unchanged.
- Child row edges insert into that group at the shown position, including the first and last slots; the insertion line has the same 24px indent as the children. Root row edges sort outside the whole group with a full-width line. Group borders and insertion lines are mutually exclusive.
- Pointer drag cards stay 12px below the pointer to expose insertion feedback; keyboard drag cards keep their existing row anchor.
- Keep the 6px drag threshold and 24px indent. Each vertical sorting margin is the smaller of 16px and one quarter of the full row height, leaving at least the middle half for nesting, including 32px single-line rows. The nesting zone covers the left 60% of the row width (at least 200px). Clip these zones to the visible viewport without moving their boundaries within the row.
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
- Nest/unnest are finite generation/version-guarded commands. `nest.beforeId` optionally inserts before a live child of the destination root; absent/null appends. Validate its group, horizon and period in the write transaction. Membership, insertion, incoming-link and color changes share one receipt and one undo. Existing inherited links materialized on detach retain their source provenance; no dataset or sync format change is needed.
- Root ordering precedes child ordering. Flatten groups into the existing virtual list; preserve task identity, drafts, focus and scroll. Draw group borders from virtual offsets, including an unmounted root, without mounting extra group members. Borders ignore pointer events and clip to the column viewport. Cancellation, focus loss, period changes and generation changes clear previews.
- All user-visible copy is translated into Chinese, English, Japanese, Spanish and French.

## Failure cases recorded before implementation

- Hovering a child rejects its root as a nesting target, or outlines only one row instead of the complete visible group. A scrolled, unmounted root must still have a clipped group preview without mounting its children outside the virtual window.
- Child-edge insertion appends instead of inserting, uses a full-width root marker, or saves membership and order as separate operations. Cover first/middle/last positions, cross-group/cross-column insertion, same-group reordering and a single undo.
- The pointer overlay covers the insertion line. Keep it below the pointer so the line stays visible; keyboard overlays retain their row anchor.
- A same-group middle drop changes order; a deleted/reparented insertion neighbor or stale parent partially changes membership, relations or colors. Failed, unknown and cancelled drops must clear feedback and keep the receipt rules.
- Middle-row drops reorder instead of nesting; edge drops nest accidentally; invalid/hidden/history targets write; cancellation or a stale generation leaves an outline preview.
- Fixed 16px edge zones consume a 32px row's nesting area. Native drops at 35% and 65% of the row height must preview nesting; committing across automatic parent groups must nest, retain focus and support undo.
- Edge insertion lines and persisted order must match in either direction, including adjacent unchanged slots, the last sibling and one-step undo; ending or cancelling clears all drag markers.
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

- [x] Whole-group child hit zones, visible indented insertion, atomic first/middle/last placement, one-step undo and clipped virtual previews in native Electron.
- [x] Native Electron gestures, keyboard menus, detail edits, inheritance, independent children and mixed statuses.
- [x] Transactions, group moves/rollover/hold, deletion/restoration, scoped undo, restart and failed/unknown receipts.
- [x] JSON/SQLite round trips, invalid imports and protected legacy upgrade.
- [x] Typecheck, existing Vitest and affected-feature E2E; repeatable reports/screenshots under `output/tests/subtasks/`.
- [ ] Owner Windows 11 and packaged acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
