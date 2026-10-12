import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parityDigest, parityTranscript } from '@goalloom/crypto'
import vectors from './vectors.json'

it('pins the Node digest for the Hermes comparison', () => {
  const transcript = parityTranscript()
  expect(transcript).toContain('ed25519.pub d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
  expect(transcript).toContain(`xchacha.ct ${vectors.xchacha.ct}`)
  expect(transcript).toContain(`c1.pt ${vectors.c1.pt}`)
  expect(transcript).toContain(`op.pt ${vectors.op.pt}`)
  expect(transcript).toContain(`snap.pt ${vectors.snap.pt}`)
  expect(transcript).toContain(`uuidv5 ${vectors.uuid}`)
  expect(transcript).toContain('"title":"offline"')
  expect(transcript).toContain('"t":"item.place"')
  const digest = parityDigest()
  expect(digest).toMatch(/^[0-9a-f]{64}$/)
  const output = process.env.PARITY_DIGEST_OUT
  if (output) writeFileSync(output, `digest ${digest}\n`)
  console.log(`digest ${digest}`)
  expect(digest).toBe('753bccfb53c6ac4625e51184df3033154927e0727c865b4c019a572e4d4cffb1')
})
