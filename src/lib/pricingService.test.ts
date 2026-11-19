import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEED_PRICING_RULES } from './pricing'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ supabase: { from } }))

import {
  getPricingVersions,
  getPricingForDate,
  createPricingVersion,
  cancelPricingVersion,
  PricingUnavailableError,
} from './pricingService'

/** Chainable Supabase query stub that resolves to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
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

  it('createPricingVersion rejects a past date without touching the DB', async () => {
    const result = await createPricingVersion(
      { effectiveFrom: '2026-11-18', rules: SEED_PRICING_RULES, createdBy: 'a1' },
      NOW
    )
    expect(result).toEqual({ success: false, error: 'The start date cannot be in the past.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion accepts today (apply now)', async () => {
    from.mockReturnValue(query({ data: row({ id: 'new', effective_from: '2026-11-19', created_by: 'a1' }), error: null }))
    const result = await createPricingVersion(
      { effectiveFrom: '2026-11-19', rules: SEED_PRICING_RULES, createdBy: 'a1' },
      NOW
    )
    expect(result.success).toBe(true)
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
})
