# @goalloom/schema

INPUT: the v8 business DDL and `sqlite_master` rows for the seven projection tables.
OUTPUT: v9 history rewrite, sync tables, v10 nesting DDL, appearance constraint widening, additive exact-seed/binding/retirement tables, and `base_*` statements with the same STRICT constraints and triggers.
POS: shared DDL. It does not open a database and does not import `node:sqlite`.

`src/appearance.ts` rebuilds only live/base workspace constraints inside the caller’s protected transaction, preserving historical DDL and every row.

`src/sync-baseline.ts` exports `syncBaselineDdl` and its additive `bindingEpochDdl` subset. The host installs/versions them. Seed replay state is scoped to base/visible; the active binding singleton links to an immutable local transition receipt. `sync_binding_epoch_receipts` separately proves atomic same-identity epoch advances and protected-context digests without rewriting that initialization receipt. Retired row kinds preserve original SQL values outside active sequence keys.

[PROTOCOL]: Update this header when making changes, then check README.md.
