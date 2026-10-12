# Phase 0 prototype notes (2026-10-11)

This is the command list for the parity digest and the six-scenario prototype. It does not replace the measurements in `docs/mobile/goalloom-mobile-prd.md` sections 9.7, 11 or 14. Those numbers stay as published until a device run records new ones.

## What Electron ran

`pnpm typecheck` passed. `pnpm test` passed: 32 files, 200 tests. That includes `tests/crypto/parity.test.ts` and `tests/sync/phase0-prototype.test.ts`.

The pinned digest is:

```
753bccfb53c6ac4625e51184df3033154927e0727c865b4c019a572e4d4cffb1
```

It is SHA-256 over the pinned crypto outputs (Ed25519, X25519, HKDF, the XChaCha20-Poly1305 vector, C1, C3, C4, UUIDv5) plus the canonical JSON and payload hash of two fixed SyncOps. `packages/crypto/src/parity.ts` is the only implementation. Electron and the Expo runner both call it.

The six local scenarios in `packages/sync/src/prototype.ts` passed on Electron's `node:sqlite`:

1. Offline edit, then the same op applied on both clients.
2. Reorder (`item.place`) until both base hashes match.
3. Conflict reject (`item_deleted`) leaving the existing title in place.
4. Crash recovery: `send_unknown`, a repeated receipt with the same seq, one local row.
5. Key rotation: epoch 1 and epoch 2 ciphertexts differ, the payload hash does not, and the epoch 2 wrap opens only in that context.
6. Snapshot join: C4 round-trip, generation taken from the snapshot, adversarial cases 7 and 8 (unknown format and missing key pause without dropping the local row).

Runtime for that Vitest run was Electron's Node, on this Linux agent VM. It is not a packaged Mac or Windows build.

## Commands still to run

Hermes, from a Mac, in `apps/mobile`:

```sh
pnpm install --ignore-workspace
npx expo start
xcrun simctl openurl booted exp://127.0.0.1:8081
```

Copy the `digest <hex>` line from Metro, then from the repository root:

```sh
pnpm parity:digest <hex>
```

Hosted Supabase, from the repository root, with `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set (no OAuth):

```sh
pnpm test:phase0
```

That runs the same six scenarios through `push_ops`, `pull_ops`, `rotate_epoch` and `snapshot-url` on two Electron clients. The iOS app does not get those keys.

## Still open

- Hermes digest compared with the pin above, and the same check on Android.
- 64KB op × 1000 and a 25MB snapshot on a device.
- Hosted `pnpm test:phase0` on the test project.
- 1000 remote ops merged on a device, TenTap / Lexical prototypes, and a screen recording.
- Section 11 cost and section 14 schedule stay unchanged until those measurements exist.

P0.6c and P0.7 stay unchecked.
