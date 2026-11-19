import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseBookingDateTime } from './manilaTime'

describe('parseBookingDateTime', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads the start as Manila time (08:00 +08:00 = 00:00Z)', () => {
    expect(parseBookingDateTime('2026-12-01', '08:00-09:00').toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('does not depend on the process timezone', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(parseBookingDateTime('2026-12-01', '08:00-09:00').toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(parseBookingDateTime('2026-12-01', '6:00 PM - 7:00 PM').toISOString()).toBe('2026-12-01T10:00:00.000Z')
  })

  it('falls back to Manila midnight for an unrecognised slot', () => {
    expect(parseBookingDateTime('2026-12-01', 'whenever').toISOString()).toBe('2026-11-30T16:00:00.000Z')
  })
})
