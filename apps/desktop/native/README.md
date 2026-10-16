# native/

> Parent: [main](../src/main/README.md). macOS credential interaction policy.

`keychain-policy.c`: Node-API v8 module that disables Keychain authorization/unlock UI and verifies the process policy. It reads no credentials and does not edit ACLs. `src/main/keychain.ts` loads it before app readiness and checks it before every OS cipher operation.

`scripts/build/keychain-policy.ts` compiles the module during macOS main-process builds. The package unpacks and signs it with the app. Windows keeps the existing DPAPI implementation and does not load or package this module. End users need no compiler.

The Windows file list repeats the production whitelist before excluding the macOS module. electron-builder replaces the shared file list when a platform-specific list is present; exclusions alone would include development files.

[PROTOCOL]: Update this header when making changes, then check README.md.
