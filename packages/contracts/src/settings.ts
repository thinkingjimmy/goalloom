/**
 * [INPUT]: Untrusted pref.set values from a SyncOp.
 * [OUTPUT]: The allowlist of synced settings, including completed-task layout, and a strict parse of one key.
 * [POS]: Settings sync boundary. Device-local state is not a key here, so it cannot enter the op log.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Week start, timezone, calendar mode and cycle anchor travel with the locked calendar
 * (`calendar.setup`), not as a separate preference. Rollover policy travels as `policy.set`.
 *
 * Excluded from this allowlist: window size and position, sync refresh tokens, device id,
 * the sync password, and every key derived from it (workspace key, recovery key, device signing key).
 */
import { z } from 'zod'

const instant = z.string().min(20).max(40)
const provider = z.enum(['openrouter', 'vercel-gateway'])
const periodHorizon = z.enum(['year', 'half', 'cycle', 'month', 'week', 'day'])

const insightPrefs = z.strictObject({
  about: z.string().max(1000),
  stepSize: z.enum(['smallest', 'hour', 'halfDay']),
  stepNotes: z.string().max(500),
  tone: z.enum(['direct', 'gentle', 'questions']),
  focus: z.array(z.enum(['gap', 'overload', 'skip', 'vague'])).max(4),
})

const shortcutCombo = z.string().min(1).max(40).nullable()
const shortcuts = z.strictObject({
  palette: shortcutCombo.optional(),
  compose: shortcutCombo.optional(),
  settings: shortcutCombo.optional(),
  undo: shortcutCombo.optional(),
  submit: shortcutCombo.optional(),
  filters: z.literal(false).optional(),
})

const providerMeta = z.strictObject({
  consentedAt: instant.nullable(),
  verifiedAt: instant.nullable(),
  keyHint: z.string().max(12).nullable(),
  capabilities: z.strictObject({ jev: instant.nullable(), chat: instant.nullable() }),
  assistanceConsent: z.strictObject({ version: z.literal(1), at: instant }).nullable(),
})

const featureChoice = z.strictObject({ provider: provider.nullable(), enabled: z.boolean() })
const apiKey = z.string().min(8).max(512).nullable()

export const settingSchema = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('language'), value: z.enum(['system', 'zh', 'en', 'ja', 'es', 'fr']) }),
  z.strictObject({ key: z.literal('theme'), value: z.enum(['system', 'light', 'dark']) }),
  z.strictObject({ key: z.literal('style'), value: z.enum(['paper', 'minimal', 'macos']) }),
  z.strictObject({ key: z.literal('checkStyle'), value: z.enum(['outline', 'paper', 'tint']) }),
  z.strictObject({ key: z.literal('backup.enabled'), value: z.boolean() }),
  z.strictObject({ key: z.literal('backup.retention'), value: z.number().int().min(1).max(100) }),
  z.strictObject({ key: z.literal('relationLines'), value: z.boolean() }),
  z.strictObject({ key: z.literal('shortcuts'), value: shortcuts }),
  z.strictObject({ key: z.literal('columns.later'), value: z.boolean() }),
  z.strictObject({
    key: z.literal('columns.planning'),
    value: z.array(periodHorizon).min(1).max(6),
  }).superRefine((entry, ctx) => {
    if (new Set(entry.value).size !== entry.value.length) ctx.addIssue({ code: 'custom', message: 'duplicate column' })
  }),
  z.strictObject({ key: z.literal('parentOrder'), value: z.boolean() }),
  z.strictObject({ key: z.literal('collapseCompleted'), value: z.boolean() }),
  z.strictObject({
    key: z.literal('celebration'),
    value: z.strictObject({
      later: z.boolean(), year: z.boolean(), half: z.boolean(), cycle: z.boolean(),
      month: z.boolean(), week: z.boolean(), day: z.boolean(),
    }),
  }),
  z.strictObject({ key: z.literal('insight.prefs'), value: insightPrefs }),
  z.strictObject({ key: z.literal('insight.breakpoints'), value: z.boolean() }),
  z.strictObject({ key: z.literal('insight.reviews'), value: z.boolean() }),
  z.strictObject({ key: z.literal('ai.key.openrouter'), value: apiKey }),
  z.strictObject({ key: z.literal('ai.key.vercel-gateway'), value: apiKey }),
  z.strictObject({ key: z.literal('ai.meta.openrouter'), value: providerMeta }),
  z.strictObject({ key: z.literal('ai.meta.vercel-gateway'), value: providerMeta }),
  z.strictObject({ key: z.literal('ai.feature.smart'), value: featureChoice }),
  z.strictObject({ key: z.literal('ai.feature.insight'), value: featureChoice }),
])

export type Setting = z.infer<typeof settingSchema>
export type SettingKey = Setting['key']
export type SettingValue = Setting['value']

export const syncedSettingKeys = [
  'language', 'theme', 'style', 'checkStyle', 'backup.enabled', 'backup.retention',
  'relationLines', 'shortcuts', 'columns.later', 'columns.planning', 'parentOrder', 'collapseCompleted', 'celebration',
  'insight.prefs', 'insight.breakpoints', 'insight.reviews',
  'ai.key.openrouter', 'ai.key.vercel-gateway', 'ai.meta.openrouter', 'ai.meta.vercel-gateway',
  'ai.feature.smart', 'ai.feature.insight',
] as const satisfies readonly SettingKey[]

export const workspaceSettingKeys = ['theme', 'style', 'checkStyle', 'backup.enabled', 'backup.retention'] as const satisfies readonly SettingKey[]
export const rendererSettingKeys = [
  'relationLines', 'shortcuts', 'columns.later', 'columns.planning', 'parentOrder', 'collapseCompleted', 'celebration',
  'insight.prefs', 'insight.breakpoints', 'insight.reviews',
] as const satisfies readonly SettingKey[]
export const secretSettingKeys = ['ai.key.openrouter', 'ai.key.vercel-gateway'] as const satisfies readonly SettingKey[]

const rendererKeySet = new Set<string>(rendererSettingKeys)
const workspaceKeySet = new Set<string>(workspaceSettingKeys)
const secretKeySet = new Set<string>(secretSettingKeys)

export function parseSetting(key: unknown, value: unknown): Setting {
  return settingSchema.parse({ key, value })
}

export function isRendererSettingKey(key: string): key is (typeof rendererSettingKeys)[number] {
  return rendererKeySet.has(key)
}

export function isWorkspaceSettingKey(key: string): key is (typeof workspaceSettingKeys)[number] {
  return workspaceKeySet.has(key)
}

export function isSecretSettingKey(key: string): key is (typeof secretSettingKeys)[number] {
  return secretKeySet.has(key)
}

/** Disk form of an API key. The key itself stays in the OS keychain. */
export function isSecretFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
}
