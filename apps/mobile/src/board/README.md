# Mobile board navigation

INPUT: Visible horizon preferences, current/viewed periods, saved tasks, five-language copy and theme tokens.
OUTPUT: Stacked board heading/date range and an accessible horizon picker for the shared bottom sheet.
POS: Read-only viewport navigation. The app shell owns safe-area padding and sheet dismissal; task presentation lives in `../tasks/`.

- `header.tsx`: `BoardHeader` provides the 48pt heading trigger and the date subtitle. `BoardHorizonOptions` uses radio selection, current-period task counts and the same calendar-aware period labels. Rows grow with text size and long date ranges. The shared sheet bounds the list to its measured body height instead of giving the native scroll view an unbounded content height. Choosing a row changes only the board viewport.

The design source is the retained mobile review artifact: heading and date on separate lines, then a bottom selection sheet. No fixed-width anchored popover, drag-hover preview or horizontally clipped date label remains. Font-size changes rebuild the read-only board measurements and picker labels while editable sheets retain their drafts. Backlog and completion rows grow with their text. The fixed-height tab bar caps label scaling and retains full accessible names. The task list still pages between visible horizons and keeps its own scroll/drag state.

[PROTOCOL]: Update this header when making changes, then check README.md.

Native build and simulator evidence: `output/tests/mobile-board-header/README.md` at the repository root. Normal-size selection and accessibility dismissal passed on iPhone 17 and iPhone SE. Large-text touch scrolling and physical swipe dismissal remain open acceptance items; do not infer them from layout screenshots.
