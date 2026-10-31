# Build the public desktop client

Requires Node.js 24.21.0, pnpm 11.9.0 and macOS Xcode Command Line Tools for native macOS compilation.

Run `pnpm install --frozen-lockfile`, `pnpm typecheck` and `pnpm build`. Run `pnpm dev` for the local client. No private repository access is required. Without sync configuration, local work remains available.

Official production builds receive GOALLOOM_SUPABASE_URL and GOALLOOM_SUPABASE_ANON_KEY through the existing release configuration. Production requires the matching official project and anon-role credential. A source fork must change its own endpoint policy to use another service. Never supply service-role or database credentials.

`pnpm package:mac` and `pnpm package:win` build local installers. Signed macOS distribution requires your own Developer ID, provisioning and notarization configuration. Official installers and update files remain at https://github.com/thinkingjimmy/goalloom/releases.

The manual public workflow builds this repository's exact commit. Build-only creates unsigned candidates. Signed candidates retain their original file hashes through private acceptance. A migration candidate is not a product release.
