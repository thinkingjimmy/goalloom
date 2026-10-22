# Deadline calendar

The owner selected the calendar-first prototype on 2026-09-28. Item details and the composer's D field share the same deadline panel.

## Product rules

- Board rows show a compact calendar capsule on the first title line. Normal dates use a neutral fill; tomorrow uses amber with a localized label; overdue uses red with a localized label and the actual date. Dates follow the active locale, and accessible names include the full date. Completed tasks and tasks without a deadline have no capsule. Rendering uses workspace today and never writes task data.
- Open directly to the selected date's month, or workspace today when unset. Compact presets stay above the calendar; the month heading opens month/year navigation. Clear removes the draft deadline; return to today changes only the viewed month and focus.
- Use existing paper/minimal and light/dark tokens. Distinguish today, selected dates and adjacent-month dates. Localize labels, month names, weekdays and accessible date names in all five locales. Weekday order follows the workspace's ISO week start.
- The first-level deadline button reveals a short explanation on hover or focus, before the calendar opens. It explains that deadlines do not move tasks between columns, without repeating the selected date. The calendar has no info icon, and opening it hides the explanation. Escape first dismisses an open explanation or month chooser, then the calendar, then the surrounding dialog.
- Arrow keys move by day/week; Home/End use the workspace week; Page Up/Down move by month and Shift adds a year, clamping at month end. Only one day is in the Tab order. Enter/Space select; opening and closing preserve usable keyboard focus.
- The panel changes only the caller's draft. Detail selection/clear immediately autosaves; composer confirmation retains ownership of its writes. A future deadline never changes placement, period, parents or status. Existing composer numeric preset shortcuts and explicit Jev suggestions remain available.
- Floating calendars stay inside their native dialog's focus boundary, escape scrolling content and remain within the window.

## Engineering contract

- `components/due-date/DueDatePanel.tsx` owns shared presets, optional suggested dates and numeric shortcuts. `DueDateHint.tsx` attaches the explanation to detail/composer deadline buttons. `Calendar.tsx` owns viewport/focus state. None writes through IPC.
- `features/items/DuePicker.tsx` owns the detail trigger and restores focus. `features/composer/DraftRow.tsx` supplies the same panel with local draft callbacks and workspace week start.
- `components/due-date/DueDateBadge.tsx` presents row deadlines using shared theme tokens. `TaskRow` owns completed/unset visibility; it supplies workspace today.
- `lib/dates.ts` provides UTC calendar arithmetic, preserving years below 100 and clamping month changes. `i18n/format.ts` provides locale-aware presentation. The workspace supplies today; the browser's local date never determines it.
- Floating `Popover` content portals to its nearest native dialog when present, otherwise the document body. Board flow menus retain their body host.

## Failure scenarios and acceptance

- A capsule hides an overdue date, changes urgency against the host date, overlaps a long title in a narrow column, or leaves a placeholder for completed/undated tasks.
- A selected January 31 skips February or keyboard navigation picks the wrong leap-day date; a Sunday-start workspace silently uses Monday columns.
- Return to today commits a date, clearing fails to autosave in detail or prematurely creates a composer draft, or choosing a future deadline changes placement.
- A calendar press submits the enclosing form or composer; Escape closes multiple layers; closing leaves focus on a removed day.
- Dialog clipping, window resizing or translated preset widths make controls unreachable; paper/minimal dark themes retain native white styling.
- The info hint is always visible, unavailable from a keyboard, or cannot be dismissed independently.
- Calendar arrows reach invalid years, a disabled clear action remains interactive, or first/last-week cells contain malformed dates.
- Composer selection loses an explicit suggestion/manual override, numeric shortcuts stop working, or a day selection creates the draft prematurely.

Repeatable acceptance: `pnpm test:due-dates` (real Electron, isolated data), `pnpm test:ui`, `pnpm test:composer`, `pnpm test:language`, and `pnpm --filter @goalloom/desktop exec -- node tests/review/renderer.mjs --calendar` (composer interaction in a browser with mocked IPC; not desktop acceptance). Deadline reports/screenshots are saved under `output/tests/due-calendar/`. Windows and packaged-desktop checks remain separate.

[PROTOCOL]: Update this header when making changes, then check README.md.
