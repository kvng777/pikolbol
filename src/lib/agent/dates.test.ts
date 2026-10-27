import { describe, it, expect } from 'vitest'
import { manilaNow, validateDateRange, isRealDate, MAX_RANGE_DAYS } from './dates'

describe('manilaNow', () => {
  it('converts UTC to Asia/Manila (UTC+8), crossing midnight', () => {
    expect(manilaNow(new Date('2026-10-26T17:30:00Z'))).toEqual({
      date: '2026-10-27',
      time: '01:30',
      weekday: 'Tuesday',
    })
  })

  it('formats midnight as 00, not 24', () => {
    expect(manilaNow(new Date('2026-10-26T16:00:00Z')).time).toBe('00:00')
  })
})

describe('validateDateRange', () => {
  it('accepts a valid inclusive range', () => {
    expect(validateDateRange('2026-10-01', '2026-10-31')).toEqual({ ok: true })
  })

  it('accepts a single day', () => {
    expect(validateDateRange('2026-10-26', '2026-10-26')).toEqual({ ok: true })
  })

  it('rejects bad format', () => {
    expect(validateDateRange('10/01/2026', '2026-10-31').ok).toBe(false)
  })

  it('rejects start after end', () => {
    expect(validateDateRange('2026-11-01', '2026-10-01').ok).toBe(false)
  })

  it(`rejects ranges longer than ${MAX_RANGE_DAYS} days`, () => {
    expect(validateDateRange('2024-01-01', '2026-01-01').ok).toBe(false)
  })
})

describe('isRealDate', () => {
  it('rejects impossible dates and accepts leap day', () => {
    expect(isRealDate('2026-02-30')).toBe(false)
    expect(isRealDate('2028-02-29')).toBe(true)
  })
})

describe('validateDateRange extras', () => {
  it('rejects impossible dates', () => {
    expect(validateDateRange('2026-02-30', '2026-03-01').ok).toBe(false)
  })
  it('enforces the 366-day boundary', () => {
    expect(validateDateRange('2025-01-01', '2025-12-31').ok).toBe(true)
    expect(validateDateRange('2024-01-01', '2024-12-31').ok).toBe(true)
    expect(validateDateRange('2024-01-01', '2025-01-01').ok).toBe(false)
  })
})
