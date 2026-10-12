# Phase 0 prototype notes

Measurements below are from commit `0c68962` on 2026-10-12. They do not replace the speculative Hermes column in `docs/mobile/goalloom-mobile-prd.md` section 9.7, and they do not change section 11 costs or section 14 schedule.

## Verified

Node parity digest, Electron and iOS simulator:

```
753bccfb53c6ac4625e51184df3033154927e0727c865b4c019a572e4d4cffb1
```

`pnpm parity:digest` reported `match` for the iPhone 16 simulator (Expo Go / Hermes). The digest is SHA-256 over the pinned crypto outputs plus the canonical JSON and payload hash of two fixed SyncOps.

Hosted `pnpm test:phase0` on the TEST project: 2/2, about 21.2s. All six scenarios passed: offline edit, reorder, conflict reject, crash recovery, key rotation, snapshot join. Test users came from the admin API. No OAuth.

Local dual-Electron run of the same six scenarios: 8–31ms per scenario.

iPhone 16 simulator timings:

| Check | Time |
|---|---|
| pinned vectors | 59ms |
| reference rebuild | 69ms |
| offline edit | 110ms |
| reorder | 104ms |
| conflict reject | 49ms |
| crash recovery | 53ms |
| key rotation | 73ms |
| snapshot join | 132ms |

## Still open

- Android Hermes byte comparison.
- On-device large-payload benchmarks: 64KB op × 1000, 25MB snapshot, and the 1000-op merge timing.
- TenTap and Lexical-DOM editor prototypes.

Section 11 and section 14 stay as published.
