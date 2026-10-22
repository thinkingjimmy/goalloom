# Appearance

Goalloom offers Paper, Minimal and macOS 27 styles. Each supports light, dark and system appearance. Style changes use the existing workspace preference transaction and encrypted sync; they do not change tasks or enter task undo history.

The macOS 27 style adapts [Apple's official Figma UI kit](https://www.figma.com/community/file/1651309434229735362/macos-27) and the `swiftui-native-design-27` guidance to Electron. It uses neutral content surfaces, compact rounded controls, blue primary actions, and translucent navigation and floating surfaces. It does not bundle Apple assets or use SwiftUI APIs. Content and flow colors keep their existing meaning. Reduced transparency and increased contrast use opaque surfaces.

## Inspected design references

The owner's [design-file copy](https://www.figma.com/design/ncoJiGJBWLYfnvfBGhhaHU/macOS-27--Community-?node-id=207-14487) exposes exact component contracts. Use the matching component before changing its skin.

| Component node | Applied visual contract |
| --- | --- |
| `4341:4919`, `4341:4956` | Buttons: 6px corners, 13px medium labels, neutral secondary fill and blue primary fill. Keep existing app action hit areas. |
| `4346:9976` | Segments: 24px height, 6px corners, blue selection with white text; separators only between unselected neighbors. |
| `I4358:6076;4398:24535` | Sidebar: 32px rows, 8px selection corners, gray selected row, blue icons. |
| `240:7850`, `488:1821` | Menus: 24px rows, 8px item corners, 12px surface corners, blue keyboard selection and translucent gray material. |
| `483:9251` and browser Materials page | Dark material: layered neutral fill with a fine rim and soft shadow. CSS blur approximates the material in Electron. |
| `647:2162`, `648:4854` and browser Toolbars page | Toolbar controls: capsule shape, translucent fill, reflective inner edges, fine side/rim shadows and a light 8px/15px cast shadow. Search, column visibility and settings share one continuous glass capsule with 2px inset; individual controls remain transparent until hovered or active. Keep plain form buttons separate from glass toolbar controls. |
| `479:5652` | Text fields: 6px corners, hairline edge, 8px inset and a 3.5px blue focus ring at 50% opacity. Keep task-title and composer text editing borderless. |
| `478:1065`, `497:3827`, `121:12142` | Switches: 44×20px track and 26×16px oval thumb with 14px travel. Checkbox/radio selection is blue; task completion retains flow/state semantics and hit areas. |
| `4356:4829` | Forms: 12px grouped surfaces, 3% neutral fill, 42px minimum rows and hairline separators. |
| `171:9049`, `4336:13205` | Dialogs/popovers: 16px window corners, compact fields and readable elevated content. Preserve existing native dialog focus and popup positioning. |
| `480:856`, `4331:12289` | Capsule search fields and compact light/dark tooltips with a fine rim and shallow shadow. |

The kit's blue `#0088ff`, menu selection `#0069f9` and gray fills are expressed as equivalent OKLCH tokens. Increased contrast uses the darker menu blue for primary controls. Existing Hugeicons and system fonts remain the rendering sources.

## Engineering contract

- `macos` is a shared style value. Desktop schema v12 widens only the workspace and sync projection style constraints, within the existing protected upgrade transaction. Task data, history, generation and revision remain intact.
- Keep the v8 DDL unchanged. Shared schema code widens both live and base workspace tables. Mobile's current offline installer accepts the shared value but continues to render its existing platform styles.
- Reuse semantic CSS variables and existing controls. `renderer/styles/macos.css` owns tokens and imports separate control, surface and feature skins; keep glass off task rows and text editors. Toolbar glass uses layered CSS reflection and blur as an Electron approximation, not native optical refraction. No remote assets, native window transparency or additional icon library.
- Apply selection and material states across settings, menus, period/deadline calendars, search, composer, detail, review/assistance, setup and transfer. Keep hover, keyboard focus, disabled, invalid, dark/system, reduced-transparency and forced-color presentation explicit. Do not alter placement, undo, editor focus or flow behavior.
- Five locales include the style label and explanation. The setting remains usable at 720px width.

## Failure cases and acceptance

Before implementation, cover: rejected preference writes; missing sync validation; SQLite constraints blocking selection/replay; lost style after restart; upgrade changing tasks/history or lacking a verified backup; dark/system mismatch; unreadable material; clipped localized settings; missing keyboard focus; reduced-transparency failure; and unrelated styles changing.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:ui`, and `node tests/macos-theme.mjs` from the desktop package. The native theme scenario verifies persisted selection, light/dark/system, five locales, compact/wide windows, menus/detail/composer, contrast, keyboard access, reduced transparency and protected v11 upgrade. Reports and screenshots live in `output/tests/macos-theme/`. Existing shared-control screenshots remain available through `tests/style-migration.mjs`. These checks do not constitute Windows or packaged release acceptance.

Owner direction for this UI pass: finish the corresponding UI first and do not continue E2E. Earlier native artifacts predate the component-accurate refinement; they are not acceptance evidence for the final skin.

[PROTOCOL]: Update this header when making changes, then check README.md.
