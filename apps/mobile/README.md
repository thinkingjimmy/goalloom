# Goalloom mobile

Offline Expo app. It shares schema v10 and the planning rules with the desktop app through `@goalloom/local-store`. There is no account, no sync and no network call in the product UI.

This directory is not a pnpm workspace member. Install it on its own so React Native is not hoisted next to Electron:

```sh
pnpm install --ignore-workspace
pnpm typecheck
pnpm lint
pnpm web
```

iOS and Android keep the workspace in expo-sqlite. The web preview uses sql.js in the page (same schema and statements) because the browser build of expo-sqlite waits on origin private file storage, which does not finish in this environment. `EXPO_PUBLIC_DEMO=1` confirms a natural calendar for 2026-10-12 in Asia/Shanghai and loads the interaction-mockup items. `?shot=` on web opens a specific screen (`today`, `mid`, `week`, `month`, `later`, `menu`, `drag`, `detail`, `sub`, `flow`, `flowsticky`, `capture`, `backlog`, `settings`, `empty`, `emptycol`, `min`, `dark`, `mindark`, `detaildark`). `?demo=1` does the same seed without the env var.

A normal launch asks for the calendar mode once, then locks it. The device language, visible columns and other preferences live in `goalloom-device.db`, outside the workspace file `goalloom.db`.

iOS Simulator and Android:

```sh
npx expo start
```

The iOS bundle id is `app.goalloom.mobile`.

## Phase 0 digest

`src/phase0.js` and `src/phase0-app.js` still run the pinned crypto vectors and a store-core rebuild. They are not the product UI. The Metro entry is `index.js`, which mounts `src/root.tsx`.

This app is MIT. It does not import `supabase/` and it does not ship secrets.
