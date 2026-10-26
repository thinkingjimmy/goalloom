/**
 * [INPUT]: Complete fixture-owned persistence/log/write payloads, strict lifecycle-owner UUIDs and memory-only synthetic markers.
 * [OUTPUT]: A boolean rejection decision; no payload, dynamic key or matched fragment leaves the scanner.
 * [POS]: Acceptance boundary for server metadata, separate from permitted device result caches.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { gunzipSync, inflateSync } from 'node:zlib'
const fields = new Set(`user_id action_id capability environment eligibility status model rate_version reserved_micro charged_micro confirmed provider_request_id input_tokens output_tokens failure created_at updated_at p_user p_owner p_action p_capability p_environment p_model p_rate p_reserve p_status p_cost p_confirmed p_provider p_input p_output p_failure existing receipt error retryAt eligible id limit_micro spent_micro policy blocked reason`.split(' '))
const failures = new Set(['outcome_unknown', 'outcome_lost', 'reconciliation_closed', 'malformed_response', 'provider_failed', 'too_large', 'result_not_delivered', 'action_expired'])
const enums = {
  capability: ['evaluate','draft','review','assistance'], environment: ['development','production'],
  status: ['running','ready','failed','unknown','expired'], eligibility: ['authenticated','trial_or_paid'],
  model: ['typesafe/jev-1.14','deepseek/deepseek-v4.1-flash','deepseek/deepseek-v4.1-flash-1017'], rate_version: ['openrouter-2026-10-23-v1'],
  error: ['permission_denied','platform_budget','account_budget','account_protection','platform_concurrency','account_concurrency','platform_rate','account_rate','outcome_pending','result_not_delivered','action_expired','malformed_response','provider_failed','too_large','outcome_unknown','reconciliation_closed','not_found','unavailable'],
  policy: ['authenticated','trial_or_paid','disabled'], reason: ['manual_review','released','platform_budget','account_budget','account_protection','platform_concurrency','account_concurrency','platform_rate','account_rate'],
}
export function metadataOnly(payload, markers = []) {
  let nodes = 0
  function contains(text, depth = 0) {
    if (markers.some(marker => text.includes(marker))) return true
    if (depth >= 2 || text.length > 700_000 || !/^[A-Za-z0-9+/_=-]{12,}$/.test(text)) return false
    try {
      const bytes = Buffer.from(text, 'base64')
      if (contains(bytes.toString('utf8'), depth + 1)) return true
      for (const decode of [gunzipSync, inflateSync]) {
        try { if (contains(decode(bytes, { maxOutputLength: 512_000 }).toString('utf8'), depth + 1)) return true } catch {}
      }
    } catch {}
    return false
  }
  function visit(value, field = '', depth = 0) {
    if (++nodes > 10000 || depth > 12) return false
    if (value === null) return true
    if (typeof value === 'boolean') return ['confirmed','p_confirmed','existing','eligible','blocked'].includes(field)
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 && /(?:micro|tokens|reserve|cost|input|output)$/.test(field)
    if (typeof value === 'string') {
      if (contains(value)) return false
      const name = ({p_capability:'capability',p_environment:'environment',p_model:'model',p_rate:'rate_version',p_status:'status',p_failure:'failure',p_provider:'provider_request_id'})[field] ?? field
      if (enums[name]) return enums[name].includes(value)
      if (name === 'failure') return failures.has(value)
      if (name === 'provider_request_id') return /^gen-(?:dec-)?\d{10,16}-[A-Za-z0-9]{1,80}$/.test(value)
      if (name === 'id') return value === 'integration-shared'
      if (name === 'p_owner') return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
      if (/^(?:user_id|action_id|p_user|p_action)$/.test(name)) return /^[a-f0-9-]{36}$/i.test(value)
      if (/^(?:created_at|updated_at|retryAt)$/.test(name)) return /^\d{4}-\d\d-\d\d[T ][\d:.+-]+Z?$/.test(value) && Number.isFinite(Date.parse(value))
      return false
    }
    if (Array.isArray(value)) return value.every(child => visit(child, field, depth + 1))
    if (!value || typeof value !== 'object') return false
    return Object.entries(value).every(([name, child]) => !contains(name) && fields.has(name) && visit(child, name, depth + 1))
  }
  return visit(payload)
}
