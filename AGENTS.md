# Development agent instructions

Read [docs/PRD.md](docs/PRD.md) and [docs/TODO.md](docs/TODO.md) before implementation. This is a documentation-only repository; application work and tests are not complete.

- Keep product rules in PRD and engineering tasks / acceptance in TODO. Update them in place; do not recreate separate architecture, history, icon, decision or test-report specifications. Use commits and PR descriptions for changes and actual test results.
- Electron and Hugeicons are confirmed. Preserve offline desktop scope, one current placement, independent item states, history and rollover. Do not add deferred progress, cloud sync or future scheduling. A current column never retains a reference card after an item moves elsewhere.
- D06 relationship cardinality and D07 custom-cycle parameters remain open. Conditional UI wording and a general edge table do not authorize a multi-parent decision. Freeze these before affected production migrations. Calendar-rule changes must not silently move current items or rewrite historical boundaries.
- Implement one milestone at a time. Check a TODO only after implementation and relevant tests. Report Electron / embedded Node, OS / CPU, runner or machine type, commands and results; browser mocks, pure-function tests and CI VMs do not replace all packaged-app and physical-input checks.
- Keep domain decisions deterministic and Electron-free with an injected clock. Revalidate them in the authoritative write transaction. Apply TODO's CSP, IPC limits, atomic history, import validation, backup and conflict-safe undo contracts. Undo returning an unfinished item to an expired auto-eligible period also needs a persisted hold.
- Keep Hugeicons consistent, including shadcn internals. No second UI icon library, remote icon loading or unapproved Pro dependency. Use the free packages, explicit imports and accessible controls.
- Keep tasks, history, screenshots, exports and credentials private. No task-body telemetry, public release, open-source license, paid service or DNS change without authorization. Keep the repository Private; read the latest branch, preserve concurrent edits and never force-push. Preserve app identity and data paths across upgrades.

## Code and documentation upkeep

This review adopts a lightweight convention, not an assumed prior user mandate. Add a short README only at a real module boundary when paths and code do not explain responsibility or dependencies; do not require one in every directory. Complex domain / service modules should document INPUT (validated data/dependencies), OUTPUT (results/side effects/errors), and POS (layer and responsibility) near their public entry point, updating the contract with code changes. Avoid boilerplate in trivial components, generated shadcn code, assets and lockfiles.

Treat approximately 800 lines in a hand-written source file as a decomposition-review signal, not an automatic failure; do not split coherent code merely to satisfy a number. There is no hard eight-file-per-directory rule. Prefer responsibility boundaries, small public APIs and local tests; document justified exceptions in the PR rather than adding redundant documents. TODO §1 owns the matching engineering convention.
