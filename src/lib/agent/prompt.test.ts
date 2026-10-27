import { describe, it, expect } from 'vitest'
import { AGENT_SYSTEM_PROMPT, buildContextNote } from './prompt'
import { DAYTIME_PRICE_PER_SLOT, LATE_NIGHT_PRICE_PER_SLOT } from '@/lib/paymentConfig'

describe('prompt', () => {
  it('uses live pricing constants, not hard-coded numbers', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(`₱${DAYTIME_PRICE_PER_SLOT}`)
    expect(AGENT_SYSTEM_PROMPT).toContain(`₱${LATE_NIGHT_PRICE_PER_SLOT}`)
  })

  it('is static (no timestamps) so it stays cacheable', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('context note carries the Manila date and time', () => {
    expect(buildContextNote(new Date('2026-10-26T17:30:00Z'))).toBe(
      'Current date and time in Manila: Tuesday, 2026-10-27 01:30.'
    )
  })
})
