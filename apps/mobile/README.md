# Hermes runner

This app is not part of the desktop pnpm workspace. It runs the pinned crypto vectors and one store-core rebuild on an iOS simulator, then keeps a local list (create, reorder, a rejected remote op, full rebuild). It does not talk to Supabase.

On a Mac with Xcode selected, from this directory:

```sh
pnpm install
pnpm ios
```

`pnpm ios` is `expo start --ios`. The simulator does not need a signing team. Hermes is the Expo default. The screen and the Metro console print `通过` or `失败` and the elapsed milliseconds for `pinned vectors` and `reference rebuild`.

Android, when a device or emulator is available:

```sh
pnpm android
```

Do not install these dependencies from the repository root. A root install would hoist React Native next to the desktop app.

This app is MIT (`"license": "MIT"` in `package.json`). It loads the MIT packages under `packages/` and does not import `supabase/`.
