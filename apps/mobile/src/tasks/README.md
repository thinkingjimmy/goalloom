# Mobile tasks

INPUT: Saved `ItemRow` values, inherited flow colors, localized copy and synchronous guarded store callbacks.
OUTPUT: Board task rows, editable task details, offline source cards and due-date selection.
POS: React Native presentation shared by the board and task-detail children. Store validation remains authoritative.

- `checkbox.tsx`: Independent completion with a 44pt target, inherited flow borders and diagonal two-flow color. Later has no flow color.
- `row.tsx`: Compact task text, 24pt nesting, note/deadline signals, optional board gestures, detail-specific leading insets and title-link previews. Preview controls sit outside the task gesture target.
- `input.tsx`: `GrowingTaskInput` measures matching text outside the accessibility tree so saved multiline text, wrapping and Dynamic Type determine the complete editable height.
- `detail.tsx`: 22pt paper cards, plain editable descriptions, blue horizon and purple deadline icons, value-only property rows with an inset separator, horizon-labelled related goals, right-aligned counts, shared child rows, root colors and activity. The goal-link action is in the section heading. Debounced edits drain before navigation or dismissal; failed writes retain the draft. Nested items cannot add another nesting level or edit inherited goals/colors.
- `deadline.tsx`: Localized month grid with future dates, workspace week start, today and clear actions. Selection returns to details only after a successful write.
- `links.tsx`: Deduplicated HTTP(S) source cards on board titles and link actions in details. Cards reserve 128pt. No metadata, remote image or favicon is fetched. Saved source text remains unchanged; opening uses the system browser.

`../view.tsx` owns sheet height, keyboard clearance, grabber/scrim dismissal and back navigation. Detail, horizon, deadline, related-goal and child-create routes keep the same expanded sheet height while the keyboard is closed. The flow page retains its existing presentation.

[PROTOCOL]: Update this header when making changes, then check README.md.
