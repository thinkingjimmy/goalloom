# Desktop sync

Two desktop installs sign in with the same Google account, share one recovery key, and converge encrypted ops. The board stays usable while signed out. Apple sign-in, payments, snapshots and QR pairing are not in this client.

The engine lives in `packages/sync` (`SyncRemote`, session, board, codec). Desktop OAuth and the keychain vault stay in `src/main/sync`. `apps/mobile` is not part of this change.

## What the owner configures

Do not commit the anon key or the Google client secret.

1. Google Cloud: an OAuth client whose authorized redirect is `https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1/callback`. The desktop does not register its own Google redirect.
2. Supabase Dashboard → Authentication → Google: enable the provider with that client id and secret.
3. Supabase Dashboard → Authentication → URL configuration: add `http://127.0.0.1:53682/callback` to the redirect allow list. Site URL can stay the project URL. The app uses this loopback because `goalloom://` already serves the local window.
4. Apply `supabase/migrations/0005_desktop_client.sql` to the dev project (and keep `0001`–`0004` applied). The client does not deploy it. Linux `register_device` fails until `linux` is an allowed platform. Every client needs `list_account`, `get_roster`, `get_key_envelopes` and `put_key_envelopes`.
5. Authentication → Realtime: leave “Allow public access to Realtime channels” off. The client polls every 8 seconds and treats a private `ws:<id>` broadcast as an optional accelerator.
6. Give the desktop the anon key without committing it: `GOALLOOM_SUPABASE_ANON_KEY`, or `sync-config.json` in the app user-data directory (`{ "url": "https://asqyvcnxdltzzfutbbqy.supabase.co", "anonKey": "..." }`). The URL defaults to that dev project. `GOALLOOM_SUPABASE_URL` overrides it.
7. `public.sync_entitled` stays the existing stub that returns true. Do not add a payments table for this client.
8. JWT `session_id` is already required by `_device_guard`. Asymmetric JWT signing is not required for this client.

## Manual test on two machines

Use two user-data directories, or two computers, with the same anon key and migration `0005` applied.

1. Machine A: Settings → Sync → Sign in with Google. Create the recovery key, write down the 24 English words, confirm the three requested words. Create a week goal and nest a subtask under it.
2. Machine B: sign in with the same Google account. Enter the 24 words. If B already has items, leave the acknowledgement unchecked until you mean it, export JSON if you want a copy, then choose “use the other board” or “merge”.
3. The nested task appears on B. Edit a title on B and confirm A shows it. Turn networking off, edit both sides, reconnect, and confirm both boards match.
4. Delete an item on A and edit that same item on B before either syncs. After both reconnect, the item stays deleted and each board shows a kept conflict. The other items are unchanged.
5. Sign out. The board remains editable. Quit and reopen without ever signing in: capture, search and the Later sidebar still work.
6. Sign in with a different Google account on a machine that already joined. Sync reports a mismatch and does not upload that board.

A missing anon key leaves the Sync pane unconfigured. A keychain that cannot encrypt (Linux `basic_text`) leaves sync locked. Neither state blocks the rest of the app.
