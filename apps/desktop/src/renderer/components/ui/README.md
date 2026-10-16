# ui/

> L2 | Parent: [renderer](../../README.md)

- `button.tsx`: shadcn Button and shared action/settings/icon/text presentations. CVA variants retain the existing desktop densities; refs and native attributes reach the original element.
- `fields.tsx`: Input/Textarea presentation with shared tokens and caller-owned labels, validation, focus and persistence.
- `switch.tsx`: Controlled native-button switch with accessible checked state, keyboard activation and the existing track/thumb geometry.
- `menu.ts`: Shared Tailwind surface, row and content classes for Radix and custom menus; retains semantic DOM markers at each call site.
- `select.tsx`: Radix Select composition with Hugeicons, caller overrides and portal ownership inside native dialogs.
- `context-menu.tsx`: Radix context-menu composition using the same menu classes; preserves trigger, submenu and focus behavior.
- `LICENSE`: shadcn/ui MIT attribution.

Use named variants for repeated control appearances and `className` for local exceptions. Use the shared `cn` helper so named theme utilities and caller overrides merge correctly. Components own presentation; feature callers own state, labels, commands and persistence. `Modal`, `Popover` and the deadline calendar retain their existing behavior.

Keep a semantic marker outside `cn` when its name can be mistaken for a utility. `TextButton` does this for `text-button`, because `text-*` also names Tailwind colors.

[PROTOCOL]: Update this header when making changes, then check README.md.
