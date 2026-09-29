/**
 * [INPUT]: Native close requests and renderer drain acknowledgements.
 * [OUTPUT]: Fixed, token-bound close handshake schemas and event names.
 * [POS]: Lifecycle-only IPC; no paths, commands or task content cross this channel.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'

export const closeRequestEvent = 'goalloom:prepare-close'
export const closeReplyEvent = 'goalloom:close-ready'
export const closeRequestSchema = z.strictObject({ token: z.string().uuid() })
export const closeReplySchema = closeRequestSchema.extend({ ready: z.boolean() })
