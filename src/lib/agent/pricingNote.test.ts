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

  it('says no price applies today for an empty list and for future-only versions', () => {
    const msg = 'Pricing note: no price version applies today. Do not quote prices.'
    expect(buildPricingNote([], '2026-11-19')).toBe(msg)
    expect(buildPricingNote([v({ effective_from: '2026-12-01' })], '2026-11-19')).toBe(msg)
  })

  it('says equipment is always charged when there is no start date', () => {
    const note = buildPricingNote([v({ rules: { ...SEED_PRICING_RULES, equipment_charge_start_date: null } })], '2026-11-19')
    expect(note).toContain('Equipment per booking (always charged)')
    expect(note).not.toContain('free before')
  })

  it('leaves out a tier that no hour uses', () => {
    const hour_tiers = SEED_PRICING_RULES.hour_tiers.map(() => 'daytime' as const)
    const note = buildPricingNote([v({ rules: { ...SEED_PRICING_RULES, hour_tiers } })], '2026-11-19')
    expect(note).toContain('daytime ₱200')
    expect(note).not.toContain('off-peak')
    expect(note).not.toContain('late-night')
  })

  it('treats a version starting exactly today as current, not upcoming', () => {
    const today = v({ id: 'today', effective_from: '2026-11-19', rules: { ...SEED_PRICING_RULES, paddle_price: 77 } })
    const note = buildPricingNote([v({}), today], '2026-11-19')
    expect(note).toContain('in effect since 2026-11-19')
    expect(note).toContain('paddles ₱77 each')
    expect(note).not.toContain('Scheduled change')
  })

  it('lists only the effective version for a date with several versions', () => {
    const older = v({ id: 'a', effective_from: '2026-12-01', created_at: '2026-11-01T00:00:00Z', rules: { ...SEED_PRICING_RULES, paddle_price: 61 } })
    const newer = v({ id: 'b', effective_from: '2026-12-01', created_at: '2026-11-02T00:00:00Z', rules: { ...SEED_PRICING_RULES, paddle_price: 62 } })
    const note = buildPricingNote([v({}), older, newer], '2026-11-19')
    expect(note.match(/Scheduled change for play dates from 2026-12-01/g)).toHaveLength(1)
    expect(note).toContain('paddles ₱62 each')
    expect(note).not.toContain('paddles ₱61 each')
  })

  it('formats large amounts with thousands separators', () => {
    const note = buildPricingNote([v({ rules: { ...SEED_PRICING_RULES, tier_prices: { ...SEED_PRICING_RULES.tier_prices, daytime: 1200 } } })], '2026-11-19')
    expect(note).toContain('daytime ₱1,200')
  })
})
