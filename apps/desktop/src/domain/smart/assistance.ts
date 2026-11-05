/**
 * [INPUT]: Authoritative bounded context, explicit user input, locale and bounded JSON output.
 * [OUTPUT]: Complete-note rewrite prompts, plus strictly validated finite model output.
 * [POS]: Pure model boundary; no tools, model chaining, IO or workspace mutation.
 */
import { assistanceOutputSchema, type AssistanceContext, type AssistanceOutput, type AssistanceRequest } from '../../shared/contracts/assistance'
import type { ChatPrompt } from './insight'
import { rewriteNotesPrompt } from './rewrite-notes'

export const assistancePromptVersion = 2
export function assistancePrompt(context: AssistanceContext, request: AssistanceRequest): ChatPrompt {
  return rewriteNotesPrompt(context, request)
}
export function parseAssistance(content: string): AssistanceOutput {
  if (!content.trim() || new TextEncoder().encode(content).byteLength > 64 * 1024) throw new Error('Assistance output exceeds the byte budget')
  return assistanceOutputSchema.parse(JSON.parse(content))
}
