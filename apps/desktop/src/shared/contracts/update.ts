/**
 * [INPUT]: Zod and the fixed update actions a renderer may request.
 * [OUTPUT]: Update channel/event names, action schema and the app version + updater phase DTO.
 * [POS]: Narrow software-update bridge; no URLs, paths or release notes cross it, and only main talks to GitHub Releases.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'

export const updateChannel = 'goalloom:update'
export const updateEvent = 'goalloom:update-state'
export const openAboutEvent = 'goalloom:open-about'
export const updateActionSchema = z.enum(['status', 'check', 'install'])
export type UpdateAction = z.infer<typeof updateActionSchema>

const version = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
export const updateStateSchema = z.discriminatedUnion('phase', [
  // Development builds have no signed release to compare against.
  z.strictObject({ phase: z.literal('unsupported') }),
  z.strictObject({ phase: z.literal('idle') }),
  z.strictObject({ phase: z.literal('checking') }),
  z.strictObject({ phase: z.literal('latest'), checkedAt: z.iso.datetime() }),
  z.strictObject({ phase: z.literal('downloading'), version, percent: z.number().int().min(0).max(100) }),
  z.strictObject({ phase: z.literal('ready'), version }),
  // Only a manual check reports failure; background failures keep the previous phase.
  z.strictObject({ phase: z.literal('failed') }),
])
export const updateInfoSchema = z.strictObject({ version, state: updateStateSchema })
export type UpdateState = z.infer<typeof updateStateSchema>
export type UpdateInfo = z.infer<typeof updateInfoSchema>
