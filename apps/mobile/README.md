# Goalloom mobile

Offline Expo app. It shares schema v10 and the planning rules with the desktop app through `@goalloom/local-store`. There is no account, no sync and no network call in the product UI.

This directory is its own pnpm root, like `apps/website`, so React Native is not hoisted next to Electron. The desktop workspace does not list this package.

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

## iOS

`npx expo run:ios` prints `Installing CocoaPods...` and runs `pod install` with the pod output hidden. That step can hang even when CocoaPods itself succeeds. Install the pods directly, then build without Expo's pod step:

```sh
npx expo prebuild --platform ios --no-install
cd ios && pod install
cd ..
npx expo run:ios --no-install
```

When `ios/` already exists, run `pod install` there after a native dependency change, then `npx expo run:ios --no-install`.

The iOS bundle id is `app.goalloom.mobile`. The URL scheme is `goalloom`. Screen links are read only in development builds. A release build ignores `goalloom://` and opens the board.

## Screens

iOS and Android keep the workspace in expo-sqlite. The web preview uses sql.js in the page (same schema and statements) because the browser build of expo-sqlite waits on origin private file storage, which does not finish in this environment.

`EXPO_PUBLIC_DEMO=1`, `?demo=1` on web, or `demo=1` on a screen link confirms a natural calendar for 2026-10-12 in Asia/Shanghai and loads the interaction-mockup items. That path replaces the demo database and the device preference file. Use it on a simulator or the web preview.

Web query `?shot=` and the `goalloom://shot/<name>` link open the same screens: `today`, `mid`, `week`, `month`, `later`, `menu`, `drag`, `detail`, `sub`, `flow`, `flowsticky`, `capture`, `backlog`, `settings`, `empty`, `emptycol`, `min`, `dark`, `mindark`, `detaildark`. `?dark=1` or `dark=1`, or a shot name that contains `dark`, sets the dark theme for that launch.

```sh
xcrun simctl openurl booted "goalloom://shot/today?demo=1"
xcrun simctl openurl booted "goalloom://shot/week?demo=1&dark=1"
```

Leave `dark` off and the app follows the system appearance, unless Settings chooses light or dark.

A normal launch asks for the calendar mode once, then locks it. The device language, visible columns and other preferences live in `goalloom-device.db`, outside the workspace file `goalloom.db`.

## Phase 0 digest

`src/phase0.js` and `src/phase0-app.js` still run the pinned crypto vectors and a store-core rebuild. They are not the product UI. The Metro entry is `index.js`, which mounts `src/root.tsx`.

This app is MIT. It does not import `supabase/` and it does not ship secrets.
