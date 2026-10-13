# Crypto self-review (P0, internal)

This is the v1.4.1 checklist. It is not a third-party review. Hermes is not in this environment, so items that require three runtimes stay open.

| # | Check | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Domain strings are unique and versioned | `goalloom/wrap/v1`, `goalloom/roster/v1`, `goalloom/op/v1`, `goalloom/snap/v1`, `goalloom/blob/v1`, `goalloom/recovery/v1`, `goalloom/recovery-cp/v1`, `goalloom/pair/v2` in `packages/crypto/src` | Node only |
| 2 | AEAD AAD binds workspace, epoch and object id | `op.ts` (`workspaceId`, `opId`, epoch), `stream.ts` (`uptoSeq` or blob id, chunk index), `wrap.ts` (recipient, ctx) | `packages/crypto/test/constructs.test.ts` |
| 3 | Nonces are 24 random bytes, or `base(16) ‖ u32(i) ‖ u32(last)` | `random.ts`, `stream.ts` | constructs snapshot truncation test |
| 4 | Verify with a pinned key, never a server-supplied key alone | `unwrap` takes `senderSignPub`; `verifyRecoveryJoin` uses the phrase-derived key | cases 6, 15, 21 |
| 5 | Secrets are wiped after use | `wipeRecovery`, wrap wipes the ephemeral secret and shared secret | call sites in `recovery.ts` and `wrap.ts`. Desktop safeStorage wiring is not in this change |
| 6 | One canonical JSON | `packages/contracts/src/canonical.ts` | adversarial canonical test |
| 7 | Roster and checkpoint rollback / fork | `verifyRosterExtension`, `acceptNewerCheckpoint` | cases 15, 21 |
| 8 | Decrypt and verify failures fail closed | throws, and case 8 pauses `unsupported_version` / `key_missing` | constructs, case 8 |
| 9 | Dependencies pinned | `@noble/curves@2.4.0`, `@noble/ciphers@2.4.0`, `@noble/hashes@2.4.0`, `@scure/bip39@2.4.0` exact in `packages/crypto/package.json` | lockfile |

SHA-1 is used only for UUIDv5 (RFC 4122) via `@noble/hashes/legacy.js`. It is not a KDF. That module is outside the Cure53 hash audit scope; the roster and checkpoint hashes are SHA-256.

Pinned vectors (`packages/crypto/test/vectors.json`): RFC 8032 Ed25519 test 1, RFC 7748 X25519, RFC 5869 HKDF-SHA256 case 1, the draft XChaCha20-Poly1305 key/nonce/aad, and the C1–C4 fixtures generated from those seeds. Measured 2026-10-11: Hermes (Expo Go, iPhone 16 simulator) pinned vectors passed in 559ms and the reference rebuild passed in 68ms. Node on an M3 Max passed `packages/crypto/test/constructs.test.ts`, `packages/tests/sync/phase0.test.ts` and `packages/tests/sync/adversarial.test.ts`, 22/22. Hermes Android is still open.

Server `_ed25519_verify` calls `pgsodium.crypto_sign_verify_detached` and fails closed when pgsodium is missing. Hosted Supabase grants that verify function. It does not grant `crypto_sign_new_keypair`. `supabase/tests/0001_core.test.sql` checks noble fixtures from `scripts/gen-ed25519-fixtures.mjs`.
