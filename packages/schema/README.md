# @goalloom/schema

INPUT: the v8 business DDL and `sqlite_master` rows for the seven projection tables.
OUTPUT: v9 history rewrite, sync tables, v10 nesting DDL, appearance constraint widening, and `base_*` statements with the same STRICT constraints and triggers.
POS: shared DDL. It does not open a database and does not import `node:sqlite`.

`src/appearance.ts` rebuilds only live/base workspace constraints inside the caller’s protected transaction, preserving historical DDL and every row.

[PROTOCOL]: Update this header when making changes, then check README.md.
