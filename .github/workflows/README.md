# GitHub Actions workflows

> Parent: [Development](../../docs/development.md). Manual release and CI entry points.

`release.yml` runs only through `workflow_dispatch`. The test jobs run typecheck, existing Vitest and one production build per platform. Production requires the dedicated `GOALLOOM_PRODUCTION_SUPABASE_ANON_KEY` for `keqprrgvcefqdwnxaafv`; development credentials are not a fallback.

Each test job uploads `out/` plus package metadata. The corresponding package job downloads that artifact and uses `package:mac:prepared` or `package:win:prepared`. Before packaging, the prepared-build gate checks the exact Git commit, version, platform, public configuration fingerprint and every output file hash. It then packages without another build. Signing, Apple app/DMG notarization, stapling, signed Keychain acceptance and packaged smokes remain required.

The macOS test job also runs the full native task-nesting, completed-layout, insight and insight-generation acceptance after its production build. This provides an isolated hosted desktop for title-edit Tab/Shift+Tab, pointer grouping, undo, editor retention and pointer-sensitive insight/period guidance before signing. Its synthetic reports/screenshots are uploaded as `macos-native-interaction-evidence`, including failure evidence. A failed acceptance step stops macOS packaging. Hosted checks do not replace owner Windows 11 acceptance.

The cache action is pinned to the official [v4.2.0 commit](https://github.com/actions/cache/releases/tag/v4.2.0), which supports the current cache service. The previous pointer resolved to a retired implementation and stopped run 39216739835 before checkout.

The cache is an input optimization only: restored output does not skip the production build or its manifest gate. Do not claim a cache speedup from a cache declaration. Preserve production configuration checks when changing cache keys or artifact reuse.

The draft job stages exact-version update assets and SHA256SUMS. It never publishes. Publication is an explicitly authorized separate action. GitHub Actions remains manual-only.

For performance evidence, save the run and jobs API responses, including UTC start/end of every job and step, plus local verification and publication times. Report elapsed wall time separately from summed job time; list queue time, Apple waiting and failed/interrupted attempts. Compare with the previous successful release under the same scope. The prior successful run 39115592278 took 489 seconds from run start to final update; its untested cache estimates are not measurements.

[PROTOCOL]: Update this header when making changes, then check README.md.
