# Development agent instructions

## Status and authority

Documentation-only, v0.3. Read docs/DECISIONS.md, PRD.md, HISTORY_AND_ROLLOVER.md, ARCHITECTURE.md, TODO.md and ACCEPTANCE.md before scaffolding. No application, installer, desktop test or remote commit was produced in this delivery.

Electron is ACCEPTED. Use the existing React / TypeScript / Vite / shadcn/ui / Tailwind CSS direction. Do not reopen framework selection or scaffold Tauri / QuickGUI alongside it. FRAMEWORK_EVALUATION.md is decision background, not an active multi-backend plan. Lock actual runtime, driver and build dependencies after real platform validation.

## Confirmed product constraints

Goalloom / goalloom.com (purchase reported by the owner). Private repository slug goalloom. macOS and Windows local desktop; no accounts, cloud sync or production web application. Five horizons: Later, custom three-month cycle, Month, Week, Today. Exactly one primary planning placement per item.

No relationship-based progress rollups or completion propagation. An item reference showing a changed title/status is normal entity display, not propagation. Do not add percentages, contribution weights or KR scoring.

Relationship cardinality is still UNDECIDED. One primary placement does not imply one parent. Confirm the directed graph cardinality before production relation migrations, not the already accepted Electron or local-desktop choice.

## History and rollover

History paging changes only a column's view state. Past cards are read-only references, not additional active placements. Opening one opens the CURRENT item explicitly; editing it never rewrites the past. Disable history card drag/drop and direct completion. Do not draw current relationship edges to historical endpoints or imply full historical relationship reconstruction.

Defaults: Today auto-rolls into the current day; Week and Month use manual re-planning but may enable auto; Cycle is manual-only for P0; Later has no rollover policy. Old unfinished work stays discoverable in the current column's pending section. Do not force reviews or silently archive/delete tasks.

Rollover changes only placement/order, never due dates, relationships or status. Cross-horizon refinement (Month -> Week -> Today) is movement, not repeated postponement. Apply only the item's own placement policy, never cascade along relations.

Record actual observed processing times. An app closed from September until November performs one real September-to-November move, not invented October operations. Rollover must not depend on a background service while the app is exited.

Current entity updates, key events and operation receipts commit in one SQLite transaction. Retries do not duplicate moves/events. Batch undo is version-checked and skips subsequently modified items; append inverse records instead of deleting original history. Persist a same-target-period hold to prevent immediately reapplying an undone rollover.

History separates status at period end from later outcomes; October completion does not turn September into an on-time completion. Current title/content may be shown with an explicit current-content label. Missing legacy events require a baseline and an incomplete-history label, not fabricated past versions.

Export/restore events, policies, batch identities and undo holds with the data. Restored workspaces pause automatic catch-up until confirmed. Do not let restart bypass that pause.

## Implementation and security

Use narrow typed contextBridge/preload APIs and validated main-side IPC. Keep contextIsolation=true, sandbox=true, nodeIntegration=false. Do not expose arbitrary IPC, SQL, shell commands or filesystem access to renderer code. Load local resources; restrict external navigation and protocols.

SQLite belongs in a stable application-data directory, with tested atomic writes, migrations, consistent backups and restore validation. Native drivers must work with the actual Electron ABI and packaged CPU architecture, not just host Node. Browser mocks must be visibly nonpersistent; production must fail rather than silently use memory.

Current board reads current tables directly. The small key-event ledger supports history, rollback safety and idempotence; it is not a full event-sourcing platform, CRDT, sync queue, content-version database or complete period snapshot feature. Do not omit key events from early CRUD work and try to invent them later.

Validate real macOS/Windows runtimes, Chinese IME, drag/drop, lifecycle, history navigation, rollover/undo and restart persistence. Record measurements and tests actually run. Do not mark application TODOs complete for writing documentation.

## Privacy and external actions

Task content, local history, screenshots and backup files are private. No task bodies in developer logs or telemetry. No private-repository tokens in installers. No public releases, open-source license, DNS changes, domain purchases or paid services without authorization. Do not infer that a remote repo exists or was created from its preset name. Stable app identifiers and data paths require deliberate release decisions.
