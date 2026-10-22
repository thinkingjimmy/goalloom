# styles/

> L2 | Parent: [renderer](../README.md)

- `theme.css`: Semantic Tailwind color, radius, shadow and menu-spacing aliases backed by CSS variables. Owns paper/minimal, light/dark/system and shared status colors.
- `base.css`: Native element defaults in `@layer base`, keyboard focus, desktop drag exclusions and fallback presentation for specialized native fields.

- `macos.css`: Opt-in macOS 27 semantic palette, layered glass tokens, skin imports and final forced-color overrides.
- `macos-controls.css`: Shared buttons, fields, radio/checkbox/switch controls, segments and menu states; preserves feature-owned focus and hit areas.
- `macos-surfaces.css`: Window/sheet surfaces, a continuous reflective toolbar action group, popovers, tooltips, Toasts and opaque material fallbacks.
- `macos-features.css`: Settings groups, calendar selection, composer/detail, review/assistance and setup/transfer integration.

The renderer entry is `../styles.css`. It imports Tailwind, then these theme/base/skin files. Shared controls live in `../components/ui`; ordinary feature layout uses Tailwind in JSX. Keep feature CSS for coordinated states, generated editor content, viewport geometry, native platform rules and animation. Keep runtime coordinates, virtual heights and flow colors in inline styles or CSS variables.

Preserve semantic class names used by DOM queries, focus, drag geometry and acceptance tests. Do not remove a marker merely because its base styling moved to Tailwind. Register new named utility tokens in `../lib/utils.ts` when `tailwind-merge` must recognize their override group.

[PROTOCOL]: Update this header when making changes, then check README.md.
