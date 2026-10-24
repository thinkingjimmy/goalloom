# styles/

> L2 | Parent: [renderer](../README.md)

- `theme.css`: Semantic Tailwind color, radius, shadow and menu-spacing aliases backed by CSS variables. Owns paper/minimal, light/dark/system and shared status colors.
- `base.css`: Native element defaults in `@layer base`, keyboard focus, desktop drag exclusions and fallback presentation for specialized native fields.

The renderer entry is `../styles.css`. It imports Tailwind, then these two files. Persistent notices and Undo Toasts share its `feedback-surface` and `feedback-action` treatments, including theme overrides; the shell owns their placement and adaptive layout. Shared controls live in `../components/ui`; ordinary feature layout uses Tailwind in JSX. Keep feature CSS for coordinated states, generated editor content, viewport geometry, native platform rules and animation. Keep runtime coordinates, virtual heights and flow colors in inline styles or CSS variables.

Preserve semantic class names used by DOM queries, focus, drag geometry and acceptance tests. Do not remove a marker merely because its base styling moved to Tailwind. Register new named utility tokens in `../lib/utils.ts` when `tailwind-merge` must recognize their override group.

[PROTOCOL]: Update this header when making changes, then check README.md.
