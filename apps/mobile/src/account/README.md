# Mobile account

INPUT: Explicit Apple/Google intents, build-time environment configuration and app foreground state.
OUTPUT: Supabase sessions, protected credential storage and five-language account status. This module never changes tasks or proves a sync password.
POS: iOS account boundary shared by onboarding and settings. Android/web use the unavailable platform port.

- `types.ts`, `service.ts`: Finite provider/state contracts, one authorization at a time, session restoration and durable local sign-out before best-effort revocation.
- `platform.ios.ts`, `platform.ts`: Native provider/nonce handling and a Keychain wrapping key over a separate encrypted SQLite vault; fallback imports no native provider SDK.
- `apple-button.ios.tsx`, `apple-button.tsx`, `buttons.tsx`: Native Apple branding, Google branding and accessible provider/wait/error controls.
- `screen.tsx`, `copy.ts`: Account settings and five complete locale catalogs.

SDK session storage uses `goalloom.auth.session`. Retiring a client aborts its requests and fences queued credential writes. A failed local deletion preserves a recoverable session and reports storage failure. Missing or damaged wrapping keys are never replaced while ciphertext exists. The app Bundle ID remains `app.goalloom.mobile`.

[PROTOCOL]: Update this header when making changes, then check README.md.
