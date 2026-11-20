import { describe, it, expect } from 'vitest'
import { pendingAgeLabel } from './pendingAge'

const now = new Date('2026-11-20T12:00:00Z')
const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString()

describe('pendingAgeLabel', () => {
  it('returns null at or under 60 minutes', () => {
    expect(pendingAgeLabel(ago(5), now)).toBeNull()
    expect(pendingAgeLabel(ago(60), now)).toBeNull()
  })
  it('shows whole hours over an hour', () => {
    expect(pendingAgeLabel(ago(61), now)).toBe('Waiting 1h')
    expect(pendingAgeLabel(ago(125), now)).toBe('Waiting 2h')
    expect(pendingAgeLabel(ago(23 * 60 + 59), now)).toBe('Waiting 23h')
  })
  it('shows 1d+ from a day', () => {
    expect(pendingAgeLabel(ago(24 * 60), now)).toBe('Waiting 1d+')
    expect(pendingAgeLabel(ago(5 * 24 * 60), now)).toBe('Waiting 1d+')
  })
  it('returns null for missing, invalid or future timestamps', () => {
    expect(pendingAgeLabel(null, now)).toBeNull()
    expect(pendingAgeLabel('nope', now)).toBeNull()
    expect(pendingAgeLabel(ago(-30), now)).toBeNull()
  })
})
