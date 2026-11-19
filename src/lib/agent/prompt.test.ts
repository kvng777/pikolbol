import { describe, it, expect } from 'vitest'
import { AGENT_SYSTEM_PROMPT, buildContextNote } from './prompt'
import { manilaNow } from './dates'

describe('prompt', () => {
  it('has no hard-coded prices (they come from the per-request pricing note)', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/₱\d/)
    expect(AGENT_SYSTEM_PROMPT).toContain('pricing note')
  })

  it('is static (no per-request timestamps) so it stays cacheable', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain(manilaNow().date)
  })

  it('context note carries the Manila date and time', () => {
    expect(buildContextNote(new Date('2026-10-26T17:30:00Z'))).toBe(
      'Current date and time in Manila: Tuesday, 2026-10-27 01:30.'
    )
  })
})
