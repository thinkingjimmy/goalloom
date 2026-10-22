# @goalloom/local-store

INPUT: a synchronous SQL driver (node:sqlite or expo-sqlite) and an injected clock.
OUTPUT: schema v10 install (shared DDL with the desktop macos style constraint), board/flow queries, and local item commands.
POS: offline workspace for the mobile app. It does not open files, talk to Supabase, or change the desktop process.

Phase 2 sync can read this database. Device language, column visibility, relation lines, parent order and celebration live in a separate database, outside the workspace.

`src/copy.ts` supplies the five localized mobile board-horizon, task-property, detail-section, calendar-navigation, save-error and offline-link labels.

[PROTOCOL]: Update this header when making changes, then check README.md.
