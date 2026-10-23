/**
 * [INPUT]: Explicit project client and reviewed hosted migrations.
 * [OUTPUT]: Exact hosted RPC source comparison, including removed overload detection.
 * [POS]: Read-only schema proof for standalone development and history-tracked production.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile } from 'node:fs/promises'
export async function hostedSchemaMatches(db, privacy = true, decisionIds = true, assistanceRevision = true) {
  const files=['supabase/migrations/0010_hosted_ai.sql',...(privacy?['supabase/migrations/0011_hosted_ai_content_minimization.sql',...(decisionIds?['supabase/migrations/0012_hosted_ai_decision_receipts.sql',...(assistanceRevision?['supabase/migrations/0013_hosted_ai_assistance_revision.sql']:[])]:[])]:[])]
  const expected=new Map()
  for(const file of files) {
    const source=await readFile(file,'utf8')
    for(const match of source.matchAll(/create (?:or replace )?function public\.(ai_\w+)[\s\S]*?as \$\$([\s\S]*?)\$\$;/gu)) expected.set(match[1],match[2].trim())
  }
  const rows=await db.query("select proname,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('ai_admit','ai_settle','ai_receipt','ai_eligibility','ai_receipt_metadata');")
  return rows.length===expected.size && [...expected].every(([name,body])=>rows.some(row=>row.proname===name&&row.prosrc.trim()===body))
}
