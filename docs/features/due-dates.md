# Deadline calendar

The owner selected the calendar-first prototype on 2026-09-28. Item details and the composer's D field share the same deadline panel.

## Product rules

- Open directly to the selected date's month, or workspace today when unset. Compact presets stay above the calendar; the month heading opens month/year navigation. Clear removes the draft deadline; return to today changes only the viewed month and focus.
- Use existing paper/minimal and light/dark tokens. Distinguish today, selected dates and adjacent-month dates. Localize labels, month names, weekdays and accessible date names in all five locales. Weekday order follows the workspace's ISO week start.
- The info icon reveals a short explanation on hover, focus or activation. It explains that deadlines do not move tasks between columns. Escape first dismisses an open explanation or month chooser, then the calendar, then the surrounding dialog.
- Arrow keys move by day/week; Home/End use the workspace week; Page Up/Down move by month and Shift adds a year, clamping at month end. Only one day is in the Tab order. Enter/Space select; opening and closing preserve usable keyboard focus.
- Selection changes only the caller's draft. Detail Save and composer confirmation keep ownership of writes. A future deadline never changes placement, period, parents or status. Existing composer numeric preset shortcuts and explicit Jev suggestions remain available.
- Floating calendars stay inside their native dialog's focus boundary, escape scrolling content and remain within the window.

## Engineering contract

- `components/due-date/DueDatePanel.tsx` owns shared presets, optional suggested dates, numeric shortcuts and the info explanation. `Calendar.tsx` owns viewport/focus state. Neither writes through IPC.
- `features/items/DuePicker.tsx` owns the detail trigger and restores focus. `features/composer/DraftRow.tsx` supplies the same panel with local draft callbacks and workspace week start.
- `lib/dates.ts` provides UTC calendar arithmetic, preserving years below 100 and clamping month changes. `i18n/format.ts` provides locale-aware presentation. The workspace supplies today; the browser's local date never determines it.
- Floating `Popover` content portals to its nearest native dialog when present, otherwise the document body. Board flow menus retain their body host.

## Failure scenarios and acceptance

- A selected January 31 skips February or keyboard navigation picks the wrong leap-day date; a Sunday-start workspace silently uses Monday columns.
- Return to today commits a date, clearing writes before Save, or choosing a future deadline changes placement.
- A calendar press submits the enclosing form or composer; Escape closes multiple layers; closing leaves focus on a removed day.
- Dialog clipping, window resizing or translated preset widths make controls unreachable; paper/minimal dark themes retain native white styling.
- The info hint is always visible, unavailable from a keyboard, or cannot be dismissed independently.
- Calendar arrows reach invalid years, a disabled clear action remains interactive, or first/last-week cells contain malformed dates.
- Composer selection loses an explicit suggestion/manual override, numeric shortcuts stop working, or a day selection creates the draft prematurely.

Repeatable acceptance: `pnpm test:due-dates` (real Electron, isolated data), `pnpm test:ui`, `pnpm test:composer`, `pnpm test:language`, and `node tests/desktop/review/renderer.mjs --calendar` (composer interaction in a browser with mocked IPC; not desktop acceptance). Deadline reports/screenshots are saved under `output/tests/due-calendar/`. Windows and packaged-desktop checks remain separate.

[PROTOCOL]: Update this header when making changes, then check README.md.
