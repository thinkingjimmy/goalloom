/**
 * [INPUT]: Public HTTP(S) URLs and bounded, inert metadata returned by main.
 * [OUTPUT]: Strict link action/preview DTOs and the fixed link channel.
 * [POS]: Dedicated preview/browser bridge; no HTML, file paths, headers or task bodies cross it.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { normalizeLinkUrl } from '../links'

export const linkChannel = 'goalloom:link'
const urlSchema = z.string().max(4096).refine(value => normalizeLinkUrl(value) !== null).transform(value => normalizeLinkUrl(value)!)
export const linkActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('preview'), url: urlSchema }),
  z.strictObject({ type: z.literal('open'), url: urlSchema }),
])
export const linkPreviewSchema = z.strictObject({
  url: urlSchema,
  status: z.enum(['ready', 'unavailable']),
  title: z.string().max(1000),
  siteName: z.string().max(200),
  description: z.string().max(2000),
  image: z.string().max(1_500_000).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
})
export type LinkPreview = z.infer<typeof linkPreviewSchema>
