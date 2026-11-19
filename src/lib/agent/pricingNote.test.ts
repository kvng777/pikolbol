import { describe, it, expect } from 'vitest'
import { buildPricingNote } from './pricingNote'
import { SEED_PRICING_RULES } from '@/lib/pricing'
import type { PricingVersion } from '@/types/pricing'

const v = (over: Partial<PricingVersion>): PricingVersion => ({
  id: 'v', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: null,
  created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
})

describe('buildPricingNote', () => {
  it('describes the current prices', () => {
    const note = buildPricingNote([v({})], '2026-11-19')
    expect(note).toContain('daytime ₱200 (6 AM - 6 PM)')
    expect(note).toContain('off-peak ₱250 (5 AM - 6 AM & 6 PM - 10 PM)')
    expect(note).toContain('4 players included; +₱50 per extra player')
    expect(note).toContain('paddles ₱50 each')
    expect(note).toContain('charged for play dates from 2026-06-01')
    expect(note).toContain('within 24 hours of the slot keep a ₱100/slot fee')
  })

  it('lists scheduled changes', () => {
    const dec = v({ id: 'dec', effective_from: '2026-12-01', rules: { ...SEED_PRICING_RULES, tier_prices: { daytime: 220, offpeak: 270, latenight: 320 } } })
    const note = buildPricingNote([v({}), dec], '2026-11-19')
    expect(note).toContain('Scheduled change for play dates from 2026-12-01')
    expect(note).toContain('daytime ₱220')
  })

  it('says prices are unavailable when they could not be loaded', () => {
    expect(buildPricingNote(null, '2026-11-19')).toMatch(/could not be loaded/)
  })

  it('does not leak admin ids', () => {
    const note = buildPricingNote([v({ created_by: 'admin-uuid-123' })], '2026-11-19')
    expect(note).not.toContain('admin-uuid-123')
  })
})
