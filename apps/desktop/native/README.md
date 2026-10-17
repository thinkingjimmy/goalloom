# native/

> Parent: [main](../src/main/README.md). macOS credential interaction policy.

`keychain-policy.c`: Node-API v8 exports for the process-wide no-dialog policy and modern session-key operations. `src/main/keychain.ts` loads it before app readiness and checks it before every OS cipher operation.

`session-key.m`: Application-private Data Protection Keychain key creation/read/delete, scoped to a hashed profile path. Every operation uses `LAContext.interactionNotAllowed`; reads never create keys. Entries are device-only, do not synchronize to iCloud and need no biometric/user-presence condition. The module never changes a legacy ACL. Native keys contain no account identity or refresh token.

`scripts/build/keychain-policy.ts` compiles the module during macOS main-process builds. The package unpacks and signs it with the app. Windows keeps the existing DPAPI implementation and does not load or package this module. End users need no compiler.

The Windows file list repeats the production whitelist before excluding the macOS module. electron-builder replaces the shared file list when a platform-specific list is present; exclusions alone would include development files.

Developer ID builds require `947MAGH97Q.com.goalloom.desktop` as both the application identifier and private access group, backed by an embedded macOS distribution provisioning profile. The build hook validates that profile and applies `build/entitlements.mac.session.plist` to the main executable. Helpers keep their existing entitlements. Unprovisioned development/ad-hoc builds fail silently into password recovery; they cannot establish native automatic-session acceptance.

[PROTOCOL]: Update this header when making changes, then check README.md.
