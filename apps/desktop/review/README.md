# Desktop error UI review

> Parent: [renderer map](../src/renderer/README.md) and [development guide](../../../docs/development.md).

Run from the repository root:

```bash
pnpm review:errors
```

Open `http://127.0.0.1:4179`. The standalone page imports the current desktop React components and CSS. Each iframe installs an in-memory preload fixture before mounting the real board and owning UI. No user database, credentials, cloud service, native picker or external browser is accessed. The page is separate from Electron's renderer entry and is never packaged.

- `catalog.ts`: Current product errors, surface ownership and source references. Shared message catalogs provide error copy.
- `fixtures.ts`: Synthetic calendar, board, account and AI state.
- `bridge.ts`: Finite in-memory preload API and scenario-specific failures.
- `scene.tsx`: Production board and component composition.
- `drive.ts`: Existing control activation and observable readiness checks.
- `main.tsx` / `product.css`: Isolated product iframe bootstrap, readiness reporting and explicit Tailwind scanning of the sibling renderer. Importing production CSS alone does not scan component classes outside this Vite root.
- `gallery.tsx` / `gallery.css`: Search, feature filtering, deep links, style/theme/language controls and session review marks.
- `index.html` / `app.html`: Gallery and product iframe entries.
- `audit.html` / `audit.ts` / `layout.ts`: Browser E2E entry; visit `/audit.html` for all scenes or `/audit.html?scenes=board-saveUnknown,composer` for a selection. Checks error copy, production utilities, owning component layout, Settings spacing and dialog bounds. The completed report is saved under `apps/desktop/output/tests/error-ui-review/report.json`. Content/readiness checks alone are not visual acceptance.
- `native.mjs`: Isolated Electron helper with the production startup/unsaved-dialog options. Run `pnpm --filter @goalloom/desktop exec electron review/native.mjs` while the server runs; capture each native alert with CUA, save it as `native-<code>.png` under `output/tests/error-ui-review/native/`, then activate Retry to advance. These captures use synthetic paths and the development Electron icon.
- `vite.config.mts` / `tsconfig.json`: Loopback-only tooling and separate strict type checking.

Browser fixtures establish UI review coverage, not packaged desktop or failure-recovery acceptance. OS-native startup/unsaved-change dialogs use actual macOS captures served from the ignored evidence directory; they keep their captured language and system appearance. Native file pickers are not errors. Retired, unmounted Activity UI is excluded from the current product inventory. All task text and account labels are synthetic. The gallery controls are internal review tooling, separate from shipped product copy.

Type check with `pnpm review:errors:typecheck`. Production components are not changed, so the review harness owns its E2E scope rather than rerunning every product feature. Run the existing desktop type check, Vitest and production build as general checks when changing this tool.

[PROTOCOL]: Update this header when making changes, then check README.md.
