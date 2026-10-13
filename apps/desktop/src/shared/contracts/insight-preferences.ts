/**
 * [INPUT]: Explicit device-local writing preferences, never program execution facts.
 * [OUTPUT]: Shared bounded preference schema for drafting, review and task assistance.
 * [POS]: Leaf contract preventing circular dependencies between smart and assistance actions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
export const insightPrefsSchema = z.strictObject({
  about: z.string().max(1000), stepSize: z.enum(['smallest', 'hour', 'halfDay']), stepNotes: z.string().max(500),
  tone: z.enum(['direct', 'gentle', 'questions']), focus: z.array(z.enum(['gap', 'overload', 'skip', 'vague'])).max(4),
})
export type InsightPrefs = z.infer<typeof insightPrefsSchema>
