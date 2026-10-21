# apps/desktop/scripts/

> 父级：[项目地图](../../../docs/development.md)。桌面测试运行器与构建工具，不进入正式包。仓库级脚本在 [scripts](../../../scripts/README.md)。

```text
scripts/
├── test.mjs                   # 用锁定 Electron 自带 Node 运行仓库根 Vitest 配置
├── eval/                      # 智能输入真实服务评测（需 .env.local 中的 OPENROUTER_API_KEY，不进 CI）
│   ├── cases.ts
│   ├── smart.ts
│   ├── run.mjs                # `pnpm eval:smart [case-id…]`
│   └── assistance/            # `pnpm eval:assistance`
└── build/
    ├── keychain-policy.ts      # macOS Node-API module compiled and emitted by the main Vite build; Windows skips it
    ├── session-profile.mjs     # Native CMS + Xcode Python plist validation and private session entitlements before signing
    ├── third-party-notices.mjs
    ├── check-production.mjs
    ├── prepared-build.mjs      # Production commit/platform/configuration/file hashes; package jobs reuse the validated build
    ├── production.mjs          # Dedicated production configuration loader and one-build entry
    ├── debug-artifacts.mjs
    ├── apple-tools.mjs         # Shared bounded native commands, redaction and ticket recovery for hook/final verification
    ├── notarize.mjs            # One-submission afterSign/DMG notarization; bounded ticket network recovery and redacted diagnostics
    ├── package-report.mjs
    ├── package-experiment.mjs
    ├── package-locales.json
    └── package-budgets.json    # 5% growth limit; ASAR anchors use measured public 1.9.3 packages, with the 1.9.4 growth review recorded in the file
```

这些脚本的路径相对于 `apps/desktop`。根目录的 `/build/` 忽略规则不会屏蔽 `scripts/build/`。正式打包只纳入 `out/` 和 package 元数据。

Calendar code uses native Temporal from the pinned Electron runtime. The polyfill package supplies development types only; the build rejects its runtime and JSBI in all bundles, and rejects Zod in the renderer.

The macOS build also needs Xcode command-line tools. `build/keychain-policy.ts` uses the official `node-api-headers` build dependency and emits `out/main/keychain-policy.node`. The packager unpacks and signs it with the app. The production check requires this exact native module on macOS and rejects other native modules. No runtime compiler or download is required.

`build/notarize.mjs` runs after app signing and before archive creation. With an App Store Connect API key, it uploads once, saves the submission ID, waits for approval, polls the same ID within one processing deadline, then staples and validates the ticket. Uncertain upload outcomes never trigger automatic resubmission. The release workflow requires it through `GOALLOOM_REQUIRE_NOTARIZATION=1`; a local build without API-key credentials skips it. The same CLI notarizes the timestamp-signed DMG. Diagnostics go to `output/tests/notarization/`, with credentials redacted. `GOALLOOM_NOTARIZE_UPLOAD_TIMEOUT_MS` (5 minutes), `GOALLOOM_NOTARIZE_WAIT_TIMEOUT_MS` (30 minutes) and `GOALLOOM_NOTARIZE_COMMAND_TIMEOUT_MS` (2 minutes) set command limits; `GOALLOOM_NOTARIZE_EVIDENCE_DIR` can select an isolated report directory. A pending submission continues at Apple after a timeout; use its saved ID to check status before starting another build.

After acceptance, stapling and validation each allow at most three attempts within the existing command deadline. Only exit 68 with `NSURLErrorDomain Code=-1005` is retried. Other failures stop immediately. `notarize.mjs --validate-ticket <app-or-dmg>` uses that same policy for final independent validation without credentials, submission or stapling; it requires the native success marker and records `verify-app.json` / `verify-dmg.json`. Reports retain each redacted ticket attempt; retries never submit another archive or allow update ZIP creation before ticket validation.

[PROTOCOL]: Update this header when making changes, then check README.md.
