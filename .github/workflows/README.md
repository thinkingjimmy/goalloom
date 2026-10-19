# GitHub Actions Workflows

## Release Workflow Architecture (M2.2 + M2.3 Optimized)

### Test Jobs (Parallel, with Build Cache)

**test-mac** and **test-win** run in parallel:
1. Checkout + install dependencies
2. **Cache build output** (M2.2)
   - Cache key includes: pnpm-lock.yaml, src files, config
   - Restores previous build if unchanged
   - Saves ~7 min/job on cache hit
3. typecheck + test + build
4. **Upload build artifacts** (M2.3)
   - `apps/desktop/out/` + `package.json`
   - Retention: 1 day
   - Enables package jobs to skip rebuild

### Package Jobs (Depend on Test, Reuse Build)

**package-mac** and **package-win** depend on their test jobs:
1. Checkout + install dependencies
2. **Download build artifacts** (M2.3)
   - Reuses `out/` from test job
   - Skips `pnpm build` (already done)
3. Sign + notarize (macOS) or package (Windows)
4. Smoke tests on packaged artifacts
5. Upload update assets

### Benefits

**M2.2 Build Cache:**
- First run: ~10 min build
- Cache hit: ~3 min (70% faster)
- Per-platform savings: ~7 min
- Total savings: ~14 min (macOS + Windows)

**M2.3 Test/Package Decoupling:**
- Test failure feedback: 60 min → 15 min
- Package retry without re-testing: 60 min → 35 min
- True parallel execution (macOS + Windows)

**Combined Effect:**
- Clean run: similar duration (cache miss)
- Incremental run: 14 min faster (cache hit)
- Failure recovery: 45 min faster (test-only or package-only retry)

### Cache Invalidation

Cache automatically invalidates when:
- `pnpm-lock.yaml` changes (dependency update)
- `apps/desktop/src/**` changes (source code)
- `electron.vite.config.ts` changes (build config)

Fallback key `${{ runner.os }}-build-` allows partial cache reuse.

### Artifact Flow

```
test-mac ──→ build-mac-arm64 ──→ package-mac
test-win ──→ build-win-x64   ──→ package-win
```

Artifacts automatically deleted after 1 day (no manual cleanup needed).
