# Native account acceptance

INPUT: A development-only E2E simulator build, a dedicated `Goalloom … E2E` simulator, local Maestro and Java 21.
OUTPUT: Local JUnit, screenshots, logs and environment/scenario reports under root `output/tests/mobile-sync/`.
POS: Native acceptance boundary. Providers and Auth are synthetic; encrypted SQLite, Keychain, Supabase SDK, onboarding and settings are real.

`platform.ts` replaces only the account platform import in explicit iOS E2E bundles. It injects cancellation, authorization failure and a deleted wrapping key. Production rejects the E2E flag. `auth-server.mjs` listens only on loopback and returns sessions larger than the historical Keychain item limit. `run.mjs` validates the simulator and build before installing or clearing app state. It runs `maestro/` flows sequentially and disables analytics, update checks and remote Maestro API access.

Create an isolated simulator. Do not use a personal simulator or physical device for these `clearState` flows:

```sh
xcrun simctl create 'Goalloom Account E2E' com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcrun simctl boot "$GOALLOOM_E2E_DEVICE"
xcrun simctl bootstatus "$GOALLOOM_E2E_DEVICE" -b
```

Set `GOALLOOM_E2E_DEVICE` to the returned UUID. Prepare/build from the repository root:

```sh
GOALLOOM_MOBILE_E2E=1 pnpm --dir apps/mobile exec expo prebuild --platform ios --no-install
cd apps/mobile/ios
pod install
cd ../../..
GOALLOOM_MOBILE_E2E=1 xcodebuild \
  -workspace apps/mobile/ios/Goalloom.xcworkspace -scheme Goalloom \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/goalloom-ios-build \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=E2ELOCAL01 \
  ONLY_ACTIVE_ARCH=YES ARCHS=arm64
```

Xcode must generate the simulated application identifier embedded in Mach-O. `CODE_SIGNING_ALLOWED=NO` cannot exercise Keychain. Do not inject device entitlements with a later `codesign` command. Prebuild may recreate the native project; always install Pods afterwards.

```sh
GOALLOOM_E2E_DEVICE='<isolated simulator UUID>' \
GOALLOOM_E2E_APP=/private/tmp/goalloom-ios-build/Build/Products/Release-iphonesimulator/Goalloom.app \
MAESTRO_BIN='<local Maestro executable>' JAVA_HOME='<local Java 21 home>' \
node apps/mobile/tests/run.mjs auth
```

Append scenario names to replay only affected flows, for example `auth auth-sign-out`. Cases: `auth-cancel`, `auth-failure`, `auth-success` (large session plus restart and ciphertext inspection), `auth-sign-out` (local setup, durable logout, restart, login again and the original SQLite task), `auth-storage-failure` (missing wrapping key with retained ciphertext; no successful account or plaintext session).

Real Apple/Google authorization, nonce rejection by hosted Auth, verified-email linking, signed physical-device builds and Windows desktop acceptance remain separate. The next sync milestone also needs its own offline/convergence/conflict/receipt/password/merge/backup E2E; Auth flows do not cover those behaviors.

[PROTOCOL]: Update this header when making changes, then check README.md.

## Bottom navigation

`maestro/navigation-switching.yaml` checks consecutive taps and scroll-driven compact/expanded controls. Use the same command below with that filename and a separate report path. `maestro/navigation.yaml` checks only Board/Flow/Settings routing, both material surfaces and the capture entry. Use the demo-seeded build (`EXPO_PUBLIC_DEMO=1`) on a dedicated E2E simulator. It does not clear app data or use Auth. Set `MATERIAL=liquid` for iOS 26+ or `opaque` after enabling Reduce Transparency. Record a simulator video during the flow to inspect intermediate selection positions; screenshots alone do not verify motion.

```sh
MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_DISABLE_UPDATE_CHECK=true \
MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true MAESTRO_API_URL=http://127.0.0.1:54389 \
JAVA_HOME=/private/tmp/goalloom-e2e-tools/jdk-21.0.12.1+1-jre/Contents/Home \
/private/tmp/goalloom-e2e-tools/maestro/bin/maestro test \
  --udid "$GOALLOOM_E2E_DEVICE" --format JUNIT \
  --output output/tests/mobile-navigation/navigation.xml \
  --test-output-dir output/tests/mobile-navigation \
  -e MATERIAL=liquid apps/mobile/tests/maestro/navigation.yaml
```

Repeat on the compact phone, in dark appearance and at large text. With Reduce Motion enabled, selection must change immediately. With Reduce Transparency enabled, assert the `bottom-navigation-opaque` and `capture-material-opaque` test IDs. Check background tasks through the normal and fallback materials before claiming visual acceptance.

## Task detail design parity

`maestro/task-detail.yaml` opens the real demo review task, captures the rounded property/goal/child layout, checks horizon/date/goal routes, flushes an edited description through property navigation, checks independent child completion and opens child details. Use the navigation runner command with this filename and separate output paths under root `output/tests/mobile-detail-parity/`. The flow edits only disposable demo data and never clears a personal workspace. Repeat layout inspection on the compact simulator in dark appearance and at accessibility text size. Counts and inherited checkbox colors must come from saved task data.
