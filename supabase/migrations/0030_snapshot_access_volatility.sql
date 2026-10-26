-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: D2 snapshot access now takes admission/lifecycle row locks through read_access.
-- OUTPUT: PostgREST POST uses a read-write transaction for this RPC; its body and remaining contract stay intact.
-- POS: Attribute-only forward correction plus schema-cache notification. No policy, data or other function change.
-- [PROTOCOL]: Update this header when making changes, then check README.md.

alter function public.snapshot_transfer_access(uuid,uuid,uuid,bigint,text,text) volatile;
notify pgrst, 'reload schema';
