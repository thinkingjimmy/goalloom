# Goalloom mobile

Offline Expo app for Phase 1. It shares schema v10 and the planning rules with the desktop app through `@goalloom/local-store` (`@goalloom/schema` underneath, expo-sqlite on device). There is no account, no login and no sync. The only network call is the AI key check, and only after the consent box is ticked.

Phase 1 matches the desktop board in one column: the board opens on today, the bottom bar is 看板 / 流程 / 设置 (no Today tab), and the flow page is a single top-down column with the desktop’s dots and connecting lines on the left. Login, sync and reminders stay deferred. Smart input still parses on the device; insight text is not generated yet.

## Run on a Mac (iOS Simulator)

Use a Mac with Xcode 26 (iOS 26 simulator), Node 22.12 or newer, and pnpm 11. This app is its own pnpm root, so install it from `apps/mobile`, not from the desktop workspace.

```sh
cd apps/mobile
pnpm install
npx expo prebuild --platform ios --no-install
cd ios && pod install && cd ..
npx expo run:ios --no-install
```

`npx expo run:ios` by itself also works, but Expo hides `pod install` output and that step can look stuck. The three commands above install the pods where you can see them, then build a development client and launch the booted iOS Simulator.

The home-screen icon and launch splash come from `app.json` (`icon`, `ios.icon`, `android.adaptiveIcon`, `splash`). They are baked in by prebuild. A Metro reload does not change the icon; run the commands above again after an icon or splash change. The iOS icon is `assets/icon.png`, a 1024×1024 PNG with no alpha, flattened from `apps/desktop/resources/icon.png`.

After the first native build, start the same client again with:

```sh
cd apps/mobile
npx expo start --dev-client
```

Then press `i`, or open the Goalloom app in the simulator. The bundle id is `app.goalloom.mobile`.

A normal launch opens the mobile onboarding: three short benefit lines, then Continue with Google or use only on this device, then the calendar, a year direction, and an optional AI step. The AI step (and Settings › AI 服务) shows a short example, then a sheet for OpenRouter or Vercel AI Gateway. “测试并开启” checks the key with that provider and, only on success, stores it in the iOS Keychain through `expo-secure-store` (this device only, not in `goalloom.db` or a backup). “稍后” finishes setup without a key. The calendar locks when that step is left, whether or not a key was saved. The start date opens an iOS inline calendar (`@react-native-community/datetimepicker`, `display="inline"`) limited to today or earlier, the same bound as the desktop date field. The date picker, the Keychain store, the paste button and the column-menu haptic tick (`expo-haptics`) are native modules, so a Metro reload does not add them; use the prebuild and `pod install` commands above. The column menu itself reloads. There is no language picker and no step indicator. Google sign-in shows the browser-wait state only; Apple sign-in is not shown yet. the password screens are present and not connected to sync. The demo launch below skips onboarding. The device language, visible columns and other preferences live in `goalloom-device.db`, outside the workspace file `goalloom.db`.

To open the interaction-mockup items (natural calendar, 2026-10-12, Asia/Shanghai):

```sh
EXPO_PUBLIC_DEMO=1 npx expo run:ios --no-install
```

Or, with the dev client already running:

```sh
xcrun simctl openurl booted "goalloom://shot/today?demo=1"
```

`shot` names: `today`, `mid`, `week`, `month`, `later`, `menu`, `drag`, `detail`, `sub`, `flow`, `flowsticky`, `capture`, `backlog`, `settings`, `empty`, `emptycol`, `min`, `dark`, `mindark`, `detaildark`. `?dark=1` forces the dark theme for that launch. Screen links are read only in development builds. A release build ignores `goalloom://` and opens the board.

This directory is its own pnpm root, like `apps/website`, so React Native is not hoisted next to Electron. The desktop workspace does not list this package. pnpm's isolated linker does not expose Expo's transitive `babel-preset-expo` to `babel.config.js`, so that preset is a direct dependency of this package.

## Install

pnpm 11 defaults `minimumReleaseAge` to 1440 minutes and refuses a package published in the last day (`NO_MATURE_MATCHING_VERSION`). Current Expo SDK 57 packages are often inside that window. This app's `pnpm-workspace.yaml` sets `minimumReleaseAge: 0`. The desktop workspace keeps the one-day gate.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm web
```

Run those commands in `apps/mobile`. If an install still picks up the desktop gate, override it for that command:

```sh
pnpm install --ignore-workspace --config.minimumReleaseAge=0
```

Native versions follow the installed Expo SDK's `bundledNativeModules.json`. `react-native-svg` is 15.15.4. 15.12.1 does not compile on Xcode 26.6 against React Native 0.86.3 (`RNSVGImage.mm:121`, no conversion from `RCTImageResponseObserverProxy` to `shared_ptr<const ImageResponseObserver>`). After an Expo upgrade, realign with:

```sh
npx expo install --fix
```

When the one-day gate is still active, pass it through to pnpm: `npx expo install --fix -- --config.minimumReleaseAge=0`.

## Checks

From `apps/mobile`:

```sh
pnpm typecheck
pnpm lint
```

Shared planning rules, including year-crossing date ranges and the flow-page links, run with the repo tests:

```sh
pnpm test
```

from the repository root. `packages/local-store/test` is part of that Vitest run.

## Screens

iOS and Android keep the workspace in expo-sqlite (WAL, foreign keys). The web preview uses sql.js in the page (same schema and statements) because the browser build of expo-sqlite waits on origin private file storage, which does not finish in this environment.

`EXPO_PUBLIC_DEMO=1`, `?demo=1` on web, or `demo=1` on a screen link confirms a natural calendar for 2026-10-12 in Asia/Shanghai and loads the interaction-mockup items. That path replaces the demo database and the device preference file.

```sh
xcrun simctl openurl booted "goalloom://shot/week?demo=1&dark=1"
```

Leave `dark` off and the app follows the system appearance, unless Settings chooses light or dark.

When `ios/` already exists, run `pod install` there after a native dependency change, then `npx expo run:ios --no-install`.

## Phase 0 digest

`src/phase0.js` and `src/phase0-app.js` still run the pinned crypto vectors and a store-core rebuild. They are not the product UI. The Metro entry is `index.js`, which mounts `src/root.tsx`.

This app is MIT. It does not import `supabase/` and it does not ship secrets.
