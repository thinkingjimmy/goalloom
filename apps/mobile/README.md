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

A normal launch opens the mobile onboarding. Every step title starts about one sixth of the screen height below the status bar. The first screen offers multi-device sync or this device only, then Continue with Google or use directly, with no “or” divider. A Google attempt that does not finish shows a red error and the button reads try again. There is no AI step. AI is connected later from Settings › AI 服务. The onboarding AI step design is undecided (several rounds were rejected) and deferred. After the first screen, a back button of at least 52pt sits at the bottom left of Next and grows with Dynamic Type; the first screen stays full width. Settings › AI 服务 keeps the intro and a sheet for OpenRouter or Vercel AI Gateway. “测试并开启” checks the key with that provider and, only on success, stores it in the iOS Keychain through `expo-secure-store` (this device only, not in `goalloom.db` or a backup). The calendar locks when the direction step continues. The start date opens an in-app month grid limited to today or earlier, the same bound as the desktop date field. That sheet has a grabber only; 确定 is pinned to the bottom, and pulling the sheet down cancels. Week start opens a menu on the row. The time zone sheet is full height: cancel, a search field, the current zone pinned, then one flat list sorted by UTC offset. The year-direction suggestions are a single row under the field; while the keyboard is open that row sits just above it, and Back / Continue stay where they are. The return key is `UIReturnKeyType.continue` on iOS through the local module `modules/continue-return-key` (Android uses a go action and the localized label). That module, the Keychain store, the paste button and the column-menu haptic tick (`expo-haptics`) are native, so a Metro reload does not add them; use the prebuild and `pod install` commands above. The column menu itself reloads. There is no language picker and no step indicator. Google sign-in shows the browser-wait state, then the error state if it is cancelled; Apple sign-in is not shown yet. Resetting sync uses the system destructive alert. The password screens are present and not connected to sync. The demo launch below skips onboarding. The device language, visible columns and other preferences live in `goalloom-device.db`, outside the workspace file `goalloom.db`.

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

## Board and task details

`src/tasks/` shares compact task rows and flow-colored checkboxes between the board and child lists. Nesting adds 24pt; completion stays independent. Board title URLs have offline source cards, including a horizontal strip for multiple links. These cards display the saved domain and URL without fetching metadata. Details keep link actions inline.

Task details use grouped cards and icon-and-value properties. Title and description save silently after editing and drain before navigation/dismissal; failed writes keep the draft visible. The expanded detail sheet has a grabber, accessible dismiss action and scrim, without a visible Close/Save row. Horizon, related-goal, due-date and child-create routes retain that height and provide Back. iOS keyboard events reduce the usable sheet height. `src/anchor-calendar.tsx` exports the shared month grid; onboarding retains its today maximum, while task deadlines allow future dates and use the workspace week start.

The flow screen is unchanged. Native keyboard and drag-dismiss acceptance still require a simulator/device run. Repeatable browser verification instructions and evidence live under ignored `output/tests/mobile-board-ui/` at the repository root.

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

[PROTOCOL]: Update this header when making changes, then check README.md.
