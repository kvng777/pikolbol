import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEED_PRICING_RULES } from './pricing'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ supabase: { from } }))

import {
  getPricingVersions,
  getPricingForDate,
  getPricingVersionById,
  createPricingVersion,
  cancelPricingVersion,
  PricingUnavailableError,
} from './pricingService'

/** Chainable Supabase query stub that resolves to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'gt', 'order', 'single', 'maybeSingle']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return q
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'seed', effective_from: '2000-01-01', rules: SEED_PRICING_RULES,
  created_by: null, created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
})

const NOW = new Date('2026-11-19T04:00:00Z') // 12:00 Manila, 2026-11-19

describe('pricingService', () => {
  beforeEach(() => from.mockReset())

  it('returns validated versions', async () => {
    from.mockReturnValue(query({ data: [row()], error: null }))
    const versions = await getPricingVersions()
    expect(versions).toHaveLength(1)
    expect(versions[0].rules).toEqual(SEED_PRICING_RULES)
  })

  it('throws when the table cannot be read', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('throws when the table is empty', async () => {
    from.mockReturnValue(query({ data: [], error: null }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('throws when a row has invalid rules (never prices with bad data)', async () => {
    from.mockReturnValue(query({ data: [row({ rules: { ...SEED_PRICING_RULES, paddle_price: -5 } })], error: null }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('getPricingForDate picks by play date', async () => {
    from.mockReturnValue(
      query({ data: [row(), row({ id: 'dec', effective_from: '2026-12-01' })], error: null })
    )
    expect((await getPricingForDate('2026-12-02')).id).toBe('dec')
  })

  const input = { effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES, createdBy: 'a1' }

  it('createPricingVersion rejects a past date without touching the DB', async () => {
    const result = await createPricingVersion({ ...input, effectiveFrom: '2026-11-18' }, NOW)
    expect(result).toEqual({ success: false, error: 'The start date cannot be in the past.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion accepts today (apply now)', async () => {
    from.mockReturnValue(query({ data: row({ id: 'new', effective_from: '2026-11-19', created_by: 'a1' }), error: null }))
    const result = await createPricingVersion({ ...input, effectiveFrom: '2026-11-19' }, NOW)
    expect(result.success).toBe(true)
  })

  it('createPricingVersion inserts exactly the expected payload', async () => {
    const q = query({ data: row({ id: 'new', effective_from: '2026-12-01', created_by: 'a1' }), error: null })
    from.mockReturnValue(q)
    await createPricingVersion(input, NOW)
    expect(from).toHaveBeenCalledWith('pricing_schedules')
    expect(q.insert).toHaveBeenCalledTimes(1)
    expect(q.insert).toHaveBeenCalledWith({
      effective_from: '2026-12-01',
      rules: SEED_PRICING_RULES,
      created_by: 'a1',
    })
  })

  it('createPricingVersion rejects invalid rules without inserting', async () => {
    const result = await createPricingVersion(
      { ...input, rules: { ...SEED_PRICING_RULES, paddle_price: -5 } },
      NOW
    )
    expect(result).toEqual({ success: false, error: 'Invalid prices' })
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion rejects a malformed date without inserting', async () => {
    const result = await createPricingVersion({ ...input, effectiveFrom: '2026-1-5' }, NOW)
    expect(result).toEqual({ success: false, error: 'Invalid prices' })
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion caps the start date at Manila today + 2 years', async () => {
    from.mockReturnValue(query({ data: row({ id: 'new', effective_from: '2028-11-19' }), error: null }))
    expect((await createPricingVersion({ ...input, effectiveFrom: '2028-11-19' }, NOW)).success).toBe(true)
    from.mockClear()
    const result = await createPricingVersion({ ...input, effectiveFrom: '2028-11-20' }, NOW)
    expect(result.success).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion returns the DB-error result', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    expect(await createPricingVersion(input, NOW)).toEqual({ success: false, error: 'Failed to save prices' })
  })

  it('createPricingVersion does not throw if the saved row cannot be read back', async () => {
    from.mockReturnValue(query({ data: row({ rules: { nope: true } }), error: null }))
    expect(await createPricingVersion(input, NOW)).toEqual({ success: false, error: 'Failed to save prices' })
  })

  it('uses Manila time, not UTC, for "today"', async () => {
    const lateUtc = new Date('2026-11-18T16:30:00Z') // 00:30 on 11-19 in Manila
    from.mockReturnValue(query({ data: row({ id: 'new', effective_from: '2026-11-19' }), error: null }))
    expect((await createPricingVersion({ ...input, effectiveFrom: '2026-11-19' }, lateUtc)).success).toBe(true)
    from.mockClear()
    expect((await createPricingVersion({ ...input, effectiveFrom: '2026-11-18' }, lateUtc)).success).toBe(false)
    expect(from).not.toHaveBeenCalled()

    const q = query({ data: [{ id: 'dec' }], error: null })
    from.mockReturnValue(q)
    await cancelPricingVersion('dec', lateUtc)
    expect(q.gt).toHaveBeenCalledWith('effective_from', '2026-11-19')
  })

  it('cancelPricingVersion only cancels upcoming versions', async () => {
    from.mockReturnValue(query({ data: [], error: null }))
    expect(await cancelPricingVersion('seed', NOW)).toEqual({
      success: false,
      error: 'Only upcoming price changes can be cancelled.',
    })
    from.mockReturnValue(query({ data: [{ id: 'dec' }], error: null }))
    expect(await cancelPricingVersion('dec', NOW)).toEqual({ success: true })
  })

  it('cancelPricingVersion filters on id, not-yet-cancelled and a future start date', async () => {
    const q = query({ data: [{ id: 'dec' }], error: null })
    from.mockReturnValue(q)
    await cancelPricingVersion('dec', NOW)
    expect(q.update).toHaveBeenCalledWith({ cancelled_at: NOW.toISOString() })
    expect(q.eq).toHaveBeenCalledWith('id', 'dec')
    expect(q.is).toHaveBeenCalledWith('cancelled_at', null)
    expect(q.gt).toHaveBeenCalledWith('effective_from', '2026-11-19')
  })

  it('cancelPricingVersion reports a DB error', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    expect(await cancelPricingVersion('dec', NOW)).toEqual({ success: false, error: 'Failed to cancel the price change' })
  })

  describe('getPricingVersionById', () => {
    it('returns the version when found', async () => {
      const q = query({ data: row({ id: 'x' }), error: null })
      from.mockReturnValue(q)
      expect((await getPricingVersionById('x'))?.id).toBe('x')
      expect(q.eq).toHaveBeenCalledWith('id', 'x')
    })
    it('returns null when not found', async () => {
      from.mockReturnValue(query({ data: null, error: null }))
      expect(await getPricingVersionById('nope')).toBeNull()
    })
    it('throws PricingUnavailableError on a DB error', async () => {
      from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
      await expect(getPricingVersionById('x')).rejects.toBeInstanceOf(PricingUnavailableError)
    })
  })
})
