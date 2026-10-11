# Hermes runner

This app is not part of the desktop pnpm workspace. It runs the pinned crypto vectors and one store-core rebuild on an iOS simulator, then keeps a local list (create, reorder, a rejected remote op, full rebuild). It does not talk to Supabase.

On a Mac with Xcode selected, from this directory:

```sh
pnpm install --ignore-workspace
npx expo start
xcrun simctl openurl booted exp://127.0.0.1:8081
```

`pnpm install` without `--ignore-workspace` attaches this directory to the desktop workspace. `pnpm ios` (`expo start --ios`) asks osascript to open the Simulator and fails when that permission is denied. Start Metro yourself, then open the Expo URL in the already-booted simulator. The simulator does not need a signing team. Hermes is the Expo Go default. The screen and the Metro console print `通过` or `失败` and the elapsed milliseconds for `pinned vectors` and `reference rebuild`.

Measured 2026-10-11 on an iPhone 16 simulator (Expo Go): pinned vectors 559ms, reference rebuild 68ms.

Android, when a device or emulator is available:

```sh
pnpm android
```

Do not install these dependencies from the repository root. A root install would hoist React Native next to the desktop app.

This app is MIT (`"license": "MIT"` in `package.json`). It loads the MIT packages under `packages/` and does not import `supabase/`.
