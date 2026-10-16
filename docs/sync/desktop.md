# Desktop sync

Two desktop installs sign in with the same Google account, share one sync password, and converge encrypted ops. The board stays usable while signed out. Apple sign-in, payments, snapshots and QR pairing are not in this client.

The password is an ordinary secret of 8 to 128 characters. Argon2id (`m=8192` KiB, `t=2`, `p=1`, 32-byte output) derives a key that seals a random recovery keypair. Salt and those parameters travel inside the existing recovery envelope. The roster, checkpoint and workspace-key wrap stay as they are. Keys stay in the OS keychain. A phrase-era envelope does not open.

The engine lives in `packages/sync` (`SyncRemote`, session, board, codec). Desktop OAuth and the keychain vault stay in `apps/desktop/src/main/sync`. `apps/mobile` is not part of this change.

Preferences and API keys use that same log. A theme, language, shortcut or saved key becomes a `pref.set` op and is sealed with the sync password’s workspace key. The other computer applies it without a restart. The key is stored again in that computer’s keychain. The workspace database keeps a sha256 fingerprint, not the key. Window size, the sync session, the device id and the sync password itself stay on the computer where they were created. Week start is already part of the locked calendar, not a separate preference.

`collapseCompleted` uses the existing encrypted `pref.set` log and renderer settings IPC. Missing/invalid local values default to `false`; untouched defaults are not seeded. Remote application does not echo a local write and waits for active inline edits/drags to end before changing the board projection. It never changes task data, history or undo membership.

## Credential access at startup

Credential operations must never open a macOS Keychain authorization or unlock dialog, including first use, restart and upgrade. Enforce noninteractive access before Electron is ready and before each cipher call. Keep the existing OS encryption, application identity and encrypted files. If the native policy cannot load or disable interaction, do not call the cipher. If the keychain is locked or an old item's ACL does not trust this installation, show the existing in-app unavailable state and preserve its ciphertext. Automatic restoration remains available when access is already permitted.

Noninteractive acceptance failure cases: policy setup fails but the cipher still runs; first creation or a trusted restart cannot read with interaction disabled; an untrusted or locked keychain read opens UI; blocked access changes saved bytes; missing native code crashes the local board; production packages omit or fail to sign the native policy. Use a private keychain for real-OS denial/lock checks and synthetic profiles for app startup/sign-in/AI failure handling. Do not change the user's keychain search list or credential ACLs.

Startup reads the local vault file before accessing the OS cipher. A missing vault or a saved signed-out session does not check, encrypt or decrypt through the keychain. Opening Settings or reading sync status also does not request access. Clicking Google sign-in starts cipher access under the same noninteractive policy. Permitted saved sessions still refresh automatically. Saved AI keys keep their independent restoration path.

The vault stores a public resume flag beside the encrypted bytes in one atomic file replacement. The flag only controls automatic access; it is not an authentication or encryption boundary. Signing out clears that flag while preserving the encrypted device and account keys. Legacy vaults have no public flag, so they must be opened once and rewritten in the current format after successful decryption. Missing access or a damaged vault must never replace the encrypted data with new keys or plaintext.

Packaged builds keep the application identity `Goalloom`, `com.goalloom.desktop` and the existing `Goalloom` user-data directory. Source development and E2E use `Goalloom Development`, `com.goalloom.desktop.development` and a separate default data directory. Electron derives its macOS Safe Storage service name from the application name, so development no longer creates or reads the production keychain item. An explicit `--user-data-dir` still selects the requested isolated profile; it does not change the development cipher namespace.

Historical keychain entries can still trust an old development binary or a previous signing team. A current valid signature does not replace that item's access policy. The application now fails without interaction if an item cannot be read. Existing system access permits automatic restoration; otherwise the encrypted bytes stay intact and sync remains locked. The app never erases keys, weakens an ACL or opens authorization UI to repair an old entry. The user can repair access outside the app when needed.

Identity acceptance failure cases: source launches reuse the production app/keychain name or default directory; explicit profiles stop working; a production identity/path changes; permitted sessions or AI keys stop restoring. `pnpm test:keychain-native` uses real macOS Security APIs with private disposable keychains and synthetic secrets. The Electron probe checks the production policy without setting it itself, and refuses all access while interaction is allowed. It verifies first creation, restart, rejected old identities, lock rejection and cleanup without changing user credentials or permissions. It does not replace signed packaged-app upgrade acceptance.

Failure cases for acceptance: unused sync touches the cipher at launch or when Settings opens; Google sign-in does not initialize on demand; cancellation during initialization still opens the browser; unavailable or denied access opens OAuth or replaces saved keys; active sessions stop restoring; signed-out sessions request access again; a legacy vault loses its keys; saved AI credentials stop restoring. The source Electron scenario is `pnpm test:credentials`; its synthetic cipher and cloud transport do not verify the macOS authorization dialog or packaged upgrades.

## What the owner configures

Do not commit the anon key or the Google client secret.

1. Google Cloud: an OAuth client whose authorized redirect is `https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1/callback`. The desktop does not register its own Google redirect.
2. Supabase Dashboard → Authentication → Google: enable the provider with that client id and secret.
3. Supabase Dashboard → Authentication → URL configuration: add `http://127.0.0.1:53682/callback` to the redirect allow list. Site URL can stay the project URL. The OAuth redirect stays on this loopback. The in-app `goalloom://app` origin still serves the window. The page is self-contained: it waits for the code to become a session, then shows success or failure in Chinese and English, with the site header and footer, and does not load remote assets. After success it opens `goalloom://signed-in` so the OS focuses the app. macOS Info.plist and the Windows package config both declare that scheme; the running app also calls `setAsDefaultProtocolClient`.
4. Apply `supabase/migrations/0005_desktop_client.sql` and then `supabase/migrations/0006_envelope_ambiguity.sql` to the dev project (and keep `0001`–`0004` applied). The client does not deploy them. Linux `register_device` fails until `linux` is an allowed platform. Every client needs `list_account`, `get_roster`, `get_key_envelopes` and `put_key_envelopes`. `0006` is required on top of a deployed `0005`: it removes the envelope `42702` name clash and lets one op use the 1 MiB batch cap. `supabase/migrations/0007_reset_sync.sql` adds `reset_sync` for a forgotten password. It is not deployed by this client. Apply it before using Reset sync. It does not change `sync_entitled`.
5. Authentication → Realtime: leave “Allow public access to Realtime channels” off. The client polls every 8 seconds and treats a private `ws:<id>` broadcast as an optional accelerator.
6. Give the desktop the anon key without committing it. The release workflow passes the repository secret `GOALLOOM_SUPABASE_ANON_KEY`, and optional `GOALLOOM_SUPABASE_URL` (default `https://asqyvcnxdltzzfutbbqy.supabase.co`), into `electron-vite` as build-time env. The main-process build embeds those values and bundles `@supabase/supabase-js` into `out/main`. electron-builder does not ship `node_modules`, so a bare import crashes an installed app. A missing or blank anon key does not fail the build: sync stays unconfigured. Do not commit a key value.
   Runtime precedence is `GOALLOOM_SUPABASE_ANON_KEY`, then `sync-config.json` in the app user-data directory, then the baked value. The same order applies to the URL, and an empty result still falls back to the dev project URL. `sync-config.json` fields are `anonKey` and optional `url`. On macOS the user-data directory name is `Goalloom` (`~/Library/Application Support/Goalloom/`), so the file is `~/Library/Application Support/Goalloom/sync-config.json`. Windows is `%APPDATA%\Goalloom\sync-config.json`.
7. `public.sync_entitled` stays the existing stub that returns true. Do not add a payments table for this client.
8. JWT `session_id` is already required by `_device_guard`. Asymmetric JWT signing is not required for this client.

## Manual test on two machines

Use two user-data directories, or two computers, with the same anon key and migration `0005` applied.

1. Machine A: Settings → Sync → Sign in with Google. Choose a sync password of at least 8 characters and enter it again. Create a week goal and nest a subtask under it.
2. Machine B: sign in with the same Google account. Enter the same password. If B already has items, leave the acknowledgement unchecked until you mean it, export JSON if you want a copy, then choose “use the other board” or “merge”.
3. The nested task appears on B. Edit a title on B and confirm A shows it. Turn networking off, edit both sides, reconnect, and confirm both boards match.
4. Delete an item on A and edit that same item on B before either syncs. After both reconnect, the item stays deleted and each board shows a kept conflict. The other items are unchanged.
5. Sign out. The board remains editable. Quit and reopen without ever signing in: capture, search and the Later sidebar still work.
6. Sign in with a different Google account on a machine that already joined. Sync reports a mismatch and does not upload that board.
7. On A, while sync is ready, set a new password and enter it again. B can no longer open the cloud data with the old password. The new password works, and A did not have to type the old one.
8. On a computer that is signed in but cannot open the cloud data, the pane says the cloud data cannot be decrypted without the password. Reset sync deletes that account’s cloud workspace and uploads the board still on that computer under a new password. The old password does not open the new workspace.

A missing anon key — no runtime env, no `sync-config.json`, and nothing baked — leaves the Sync pane unconfigured. A keychain that cannot encrypt (Linux `basic_text`) leaves sync locked. Neither state blocks the rest of the app.
