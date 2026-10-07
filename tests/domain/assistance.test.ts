/**
 * Failure cases recorded before implementation: unknown actions/fields, fabricated identities,
 * invalid calendar dates, empty proposals, oversized input/output, and unsupported habit commands.
 */
import { expect, it } from 'vitest'
import { guidanceValueSchema, assistanceOutputSchema, assistanceRequestSchema } from '../../src/shared/contracts/assistance'
import { parseAssistance } from '../../src/domain/smart/assistance'

const guidance = { formatVersion: 1, kind: 'next_step', nextAction: 'Write one example', contextNote: null, scopeNote: null }
const proposal = { kind: 'proposal', explanation: 'Continue the existing draft', guidance, moveSuggestion: null }

it('accepts bounded guidance and only one guidance plus one explicit move', () => {
  expect(guidanceValueSchema.parse({ ...guidance, authorship: 'user' }).nextAction).toBe('Write one example')
  expect(parseAssistance(JSON.stringify(proposal))).toEqual(proposal)
  expect(assistanceOutputSchema.safeParse({ ...proposal, moveSuggestion: { horizon: 'day', localDate: '2026-10-08' } }).success).toBe(true)
})

it('rejects unsupported actions, fabricated identities and unknown fields', () => {
  for (const value of [
    { ...proposal, itemId: 'other' }, { ...proposal, command: 'delete' },
    { kind: 'create_habit', title: 'Daily example' }, { ...proposal, guidance: { ...guidance, waitingUntil: '2026-10-08' } },
    { kind: 'clarify', question: 'Which part is unfinished?', tool: 'browser' },
  ]) expect(() => parseAssistance(JSON.stringify(value))).toThrow()
})

it('rejects empty proposals, invalid dates and oversized values without repair calls', () => {
  for (const value of [
    { ...proposal, guidance: null }, { ...proposal, guidance: { ...guidance, nextAction: '' } },
    { ...proposal, guidance: { ...guidance, nextAction: 'x'.repeat(601) } },
    { ...proposal, moveSuggestion: { horizon: 'day', localDate: '2026-02-30' } },
    { ...proposal, moveSuggestion: { horizon: 'later', localDate: '2026-10-08' } },
    { kind: 'clarify', question: 'x'.repeat(201) },
  ]) expect(assistanceOutputSchema.safeParse(value).success).toBe(false)
  for (const content of ['', 'invalid JSON', 'x'.repeat(65_537)]) expect(() => parseAssistance(content)).toThrow()
})

it('bounds requests and keeps every request identity and revision explicit', () => {
  const request = { requestId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002', itemId: 'item', generation: 'generation', inputRevision: 0, manualRevision: 0, featureRevision: 1, contextId: '00000000-0000-4000-8000-000000000003', locale: 'en', turn: 1, text: 'The example is unclear', answer: null, adjustment: null }
  expect(assistanceRequestSchema.safeParse(request).success).toBe(true)
  for (const invalid of [{ ...request, turn: 4 }, { ...request, text: 'x'.repeat(2001) }, { ...request, locale: 'de' }, { ...request, arbitraryContext: {} }]) expect(assistanceRequestSchema.safeParse(invalid).success).toBe(false)
})
