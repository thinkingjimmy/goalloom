# @goalloom/schema

INPUT: the v8 business DDL and `sqlite_master` rows for the seven projection tables.
OUTPUT: v9 history rewrite, sync tables, and `base_*` statements with the same STRICT constraints and triggers.
POS: shared DDL. It does not open a database and does not import `node:sqlite`.
