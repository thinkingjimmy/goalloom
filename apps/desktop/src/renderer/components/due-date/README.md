# due-date/

> L2 | Parent: [renderer](../../README.md)

- `DueDatePanel.tsx`: Shared calendar-first deadline content, compact date presets and optional composer suggestion/numeric shortcuts. Receives the workspace day and ISO week start; selection changes only a caller-owned draft.
- `DueDateHint.tsx`: First-level deadline-trigger guidance shared by detail and composer; hover/focus opens a bounded floating tooltip, Escape dismisses it, and opening the calendar hides it.
- `Calendar.tsx`: Locale-aware day/month grids, clamped month/year navigation, roving day focus, clearing and returning to today. Date arithmetic uses `lib/dates`; text uses `i18n/format` and all five catalogs.
- `due-date.css`: Existing theme tokens for the selected calendar prototype, localized wrapping, focus states and touch sizing.

Detail and composer mount the panel through `Popover` inside their native dialog. The surrounding feature retains persistence ownership: immediate detail autosave or explicit composer confirmation. Product and acceptance rules: [due dates](../../../../../../docs/features/due-dates.md).

[PROTOCOL]: Update this header when making changes, then check README.md.
