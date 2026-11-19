import { describe, it, expect } from 'vitest'
import { pricingRulesSchema, createPricingVersionSchema, quoteInputSchema } from './pricingSchema'
import { SEED_PRICING_RULES } from './pricing'

describe('pricingRulesSchema', () => {
  it('accepts the seed rules', () => {
    expect(pricingRulesSchema.safeParse(SEED_PRICING_RULES).success).toBe(true)
  })
  it('rejects decimals, negatives and zero slot rates', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, paddle_price: 49.5 }).success).toBe(false)
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, ball_set_price: -1 }).success).toBe(false)
    expect(
      pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, tier_prices: { ...SEED_PRICING_RULES.tier_prices, daytime: 0 } }).success
    ).toBe(false)
  })
  it('requires a tier for all 19 hours', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, hour_tiers: SEED_PRICING_RULES.hour_tiers.slice(1) }).success).toBe(false)
    expect(
      pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, hour_tiers: [...SEED_PRICING_RULES.hour_tiers.slice(1), 'peak'] }).success
    ).toBe(false)
  })
  it('rejects unknown keys', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, surprise: 1 }).success).toBe(false)
  })
  it('accepts a null equipment start date, rejects a malformed one', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, equipment_charge_start_date: null }).success).toBe(true)
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, equipment_charge_start_date: '1/6/2026' }).success).toBe(false)
  })
})

describe('createPricingVersionSchema', () => {
  it('requires a real date', () => {
    expect(createPricingVersionSchema.safeParse({ effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES }).success).toBe(true)
    expect(createPricingVersionSchema.safeParse({ effectiveFrom: '2026-02-30', rules: SEED_PRICING_RULES }).success).toBe(false)
  })
})

describe('quoteInputSchema', () => {
  const ok = { date: '2026-12-01', timeSlots: ['08:00-09:00'], players: 2, paddles: 0, needsBalls: false, trainingBalls: false }
  it('accepts a normal booking', () => {
    expect(quoteInputSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects duplicate or malformed slots and silly counts', () => {
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: ['08:00-09:00', '08:00-09:00'] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: ['8am'] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: [] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, players: 0 }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, paddles: 99 }).success).toBe(false)
  })
})
