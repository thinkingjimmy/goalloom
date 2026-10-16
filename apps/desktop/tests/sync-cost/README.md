# Sync cost acceptance

INPUT: Production SyncService, the storage worker and SQLite, plus synthetic accounts and a controlled HTTP service.
OUTPUT: Baseline, scheduling, cancellation and two-peer convergence evidence under `output/tests/sync-cost/`.
POS: Sync-owned acceptance. Cloud transport and the OS cipher are synthetic; business persistence and application services remain real.

Failure cases were defined before implementation in the local plan (S01–S26); adopted behavior is now in `docs/sync/desktop.md` and `docs/sync/protocol-v1.md`. No user workspace or credentials are used. Private developer backups remain separate from synthetic test reports.

[PROTOCOL]: Update this header when making changes, then check README.md.

The full entry is `pnpm test:sync-scheduling`. It records 30-trigger foreground comparison, a four-hour 20/80 foreground/background clock workload, timeout/cancellation/late commit cases, native hide/show, five-language upload waiting, ordered 200-op batches and secret-preference retry identity. Cloud SQL, concurrent quota writes, Cron, real sleep, packaged releases and Windows are not substituted by the controlled cloud.
