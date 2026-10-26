# Goalloom mobile

Offline Expo app for Phase 1. It shares schema v10 and the planning rules with the desktop app through `@goalloom/local-store` (`@goalloom/schema` underneath, expo-sqlite on device). iOS supports native Apple/Google accounts with protected session restoration. Workspace sync is a separate milestone. The optional AI key check still needs explicit consent.

Phase 1 matches the desktop board in one column: the board opens on today, the bottom bar is 看板 / 流程 / 设置 (no Today tab), and the flow page is a single top-down column with the desktop’s dots and connecting lines on the left. iOS account login is enabled; workspace sync and reminders remain separate milestones. Smart input still parses on the device; insight text is not generated yet.

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

The home-screen icon and launch splash come from `app.json` (`icon`, `ios.icon`, `android.adaptiveIcon`, `splash`). They are baked in by prebuild. A Metro reload does not change the icon; run the commands above again after an icon or splash change. The iOS icon is `assets/icon.png`, a 1024×1024 opaque RGB export of the editable `assets/icon.svg`. It reuses the existing brand mark on a full-bleed background; iOS supplies the outer shape and effects. The finished desktop tile must not be flattened into the iOS source because its inset corners/shadow produce a second frame. See `assets/README.md` for export rules.

After the first native build, start the same client again with:

```sh
cd apps/mobile
npx expo start --dev-client
```

Then press `i`, or open the Goalloom app in the simulator. The bundle id is `app.goalloom.mobile`.

A normal launch opens the mobile onboarding. Every step title starts about one sixth of the screen height below the status bar. The first screen offers multi-device sync or this device only, with native Apple and Google buttons or direct local use, with no “or” divider. An authorization failure shows an error and allows retry; cancellation restores the choice quietly. There is no AI step. AI is connected later from Settings › AI 服务. The onboarding AI step design is undecided (several rounds were rejected) and deferred. After the first screen, a back button of at least 52pt sits at the bottom left of Next and grows with Dynamic Type; the first screen stays full width. Settings › AI 服务 keeps the intro and a sheet for OpenRouter or Vercel AI Gateway. “测试并开启” checks the key with that provider and, only on success, stores it in the iOS Keychain through `expo-secure-store` (this device only, not in `goalloom.db` or a backup). The calendar locks when the direction step continues. The start date opens an in-app month grid limited to today or earlier, the same bound as the desktop date field. That sheet has a grabber only; 确定 is pinned to the bottom, and pulling the sheet down cancels. Week start opens a menu on the row. The time zone sheet is full height: cancel, a search field, the current zone pinned, then one flat list sorted by UTC offset. The year-direction suggestions are a single row under the field; while the keyboard is open that row sits just above it, and Back / Continue stay where they are. The return key is `UIReturnKeyType.continue` on iOS through the local module `modules/continue-return-key` (Android uses a go action and the localized label). That module, the Keychain store and the paste button are native, so a Metro reload does not add them; use the prebuild and `pod install` commands above. The board header and horizon sheet reload with Metro. There is no language picker and no step indicator. iOS uses native Apple/Google authorization. A user cancellation restores the choice without an error. Missing Google iOS client IDs are reported without blocking local use. Resetting sync uses the system destructive alert. The password screens are present and not connected to sync. The demo launch below skips onboarding. The device language, visible columns and other preferences live in `goalloom-device.db`, outside the workspace file `goalloom.db`.

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

`src/navigation/` owns the floating bottom controls. iOS 26+ uses native Liquid Glass through `expo-glass-effect`; older iOS and web use `expo-blur`, while Android supplies a dedicated content blur target. Reduce Transparency replaces effects with an opaque surface. A native-driver spring moves the selected tab capsule; rapid taps interrupt it and Reduce Motion disables it. The capture action uses the same material. Install Pods and rebuild the native client after adding this native dependency; a Metro reload is insufficient.

`src/board/header.tsx` keeps the horizon heading above its date range, with 20pt side insets and a 48pt heading target. The app shell applies the native top safe area once. Tapping the heading opens the shared bottom sheet titled Choose a time horizon, with stacked names/date ranges, a checkmark on the selected horizon and task counts on other horizons. Selection closes the sheet and switches the board viewport; dismissing leaves it unchanged. Visible-column preferences and viewed periods remain the source of truth.

`src/tasks/` shares compact task rows and flow-colored checkboxes between the board and child lists. Nesting adds 24pt; completion stays independent. Board title URLs have offline source cards, including a horizontal strip for multiple links. These cards display the saved domain and URL without fetching metadata. Details keep link actions inline.

Task details match the retained review artifact with 22pt paper cards on the warm sheet background, plain descriptions, colored icon-and-value properties without trailing arrows, horizon-labelled related goals and right-aligned section counts. Goal editing remains available from the section heading; child tasks reuse the board checkbox/row with a detail inset. Title and description save silently after editing and drain before navigation/dismissal; failed writes keep the draft visible. The expanded detail sheet has a grabber, accessible dismiss action and scrim, without a visible Close/Save row. Horizon, related-goal, due-date and child-create routes retain that height and provide Back. iOS keyboard events reduce the usable sheet height. `src/anchor-calendar.tsx` exports the shared month grid; onboarding retains its today maximum, while task deadlines allow future dates and use the workspace week start.

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

## Native account configuration

### Billing account preparation

The owner confirmed on 2026-10-23 that the existing individual Apple Developer membership will be used for development, App Store submission and initial in-app purchases. Updating that membership to the Atlas organization is a later step, not a prerequisite for this phase. Apple agreements, tax answers and payout information must reflect the current individual identity; Stripe web billing keeps the company identity. Preserve `app.goalloom.mobile`, existing app records and purchase bindings when planning the later membership update. Membership conversion has not been performed.

Billing runtime integration and Apple purchase acceptance remain pending. On 2026-10-23, the monthly and annual subscription drafts were configured in one group at the same level, with no Apple introductory trial; Goalloom owns its eight-day trial. Both Apple products are mapped to RevenueCat `plus` and the existing `default` monthly/annual packages. IAP credentials are valid, both Apple notification environments use V2, and one synthetic sandbox TEST was delivered successfully. Reuse the existing provider resources. Only the App Store channel and USA sale territory are enabled; multi-seat purchases are disabled. The native SDK, purchase/restore UI, RevenueCat-to-Goalloom webhook and purchase lifecycle acceptance remain pending. The owner deferred Sandbox tester creation. Neither the synthetic TEST nor native sign-in acceptance below proves StoreKit purchases or subscription eligibility.

### Authentication build configuration

`app.config.js` loads only the selected root `.env.sync.development.local` / `.env.sync.production.local` and optional `.env.mobile.development.local` / `.env.mobile.production.local`. Set `GOALLOOM_MOBILE_ENV=production` explicitly for production. URL/ref and anon-role claims must match that environment. Production also requires `GOALLOOM_GOOGLE_IOS_CLIENT_ID` and `GOALLOOM_GOOGLE_WEB_CLIENT_ID` in its ignored mobile file. Development without Google IDs keeps local use and Apple available, and reports the incomplete provider configuration. No private signing key or client secret is read by the mobile build.

Apple native sign-in requires `app.goalloom.mobile` grouped under the existing primary Apple App ID, and `app.goalloom.auth,app.goalloom.mobile` in both Supabase Apple Client IDs fields. The Services ID stays first. Google requires an iOS OAuth client for the same Bundle ID and the corresponding accepted client IDs in Supabase. Generated native files are ignored; run prebuild, then `pod install`, then build. Changing `GOALLOOM_MOBILE_ENV` or a Google iOS Client ID requires this full native regeneration with the same target set during prebuild and build; a Metro reload cannot update the callback URL scheme. Native Auth sessions and device secrets stay in a separate encrypted credential database with only a 32-byte wrapping key in Keychain.

`tests/maestro/` contains local native login acceptance flows; [tests/README.md](tests/README.md) gives the simulator build and local runner commands. `GOALLOOM_MOBILE_E2E=1` selects a synthetic provider adapter at bundle time, with a loopback-only Auth server; production configuration rejects this flag. Never run `clearState` flows on a personal simulator. Use a newly created, explicitly marked E2E simulator, disable Maestro analytics/update checks and keep its API endpoint local. Save JUnit reports, screenshots and environment metadata under root `output/tests/mobile-sync/`. These flows do not prove real Apple/Google authorization, App Store eligibility or physical-device behavior.
