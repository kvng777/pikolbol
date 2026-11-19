import { describe, it, expect } from 'vitest'
import {
  SEED_PRICING_RULES,
  SLOT_START_HOURS,
  getSlotRateTier,
  getPriceForSlot,
  isEquipmentChargeable,
  calculateEquipmentCharge,
  calculatePaymentAmount,
  calculateCancellationFee,
  pickPricingVersion,
  upcomingPricingVersions,
  rulesFromSnapshot,
  describeTierHours,
  isSamePricedSelection,
  diffPricingRules,
  assertValidPricingRules,
} from './pricing'
import { generateTimeSlots } from './timeSlotGenerator'
import * as legacy from './paymentConfig'
import type { PricingRules, PricingVersion } from '@/types/pricing'

const R = SEED_PRICING_RULES

function version(over: Partial<PricingVersion>): PricingVersion {
  return {
    id: 'v', effective_from: '2000-01-01', rules: R, created_by: null,
    created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
  }
}

describe('seed rules', () => {
  it('match the legacy constants exactly (removed in the cleanup task)', () => {
    expect(R.tier_prices).toEqual({
      daytime: legacy.DAYTIME_PRICE_PER_SLOT,
      offpeak: legacy.EVENING_PRICE_PER_SLOT,
      latenight: legacy.LATE_NIGHT_PRICE_PER_SLOT,
    })
    expect(R.extra_player_charge).toBe(legacy.EXTRA_PLAYER_CHARGE)
    expect(R.base_players_included).toBe(legacy.BASE_PLAYERS_INCLUDED)
    expect(R.paddle_price).toBe(legacy.PADDLE_PRICE)
    expect(R.ball_set_price).toBe(legacy.BALL_SET_PRICE)
    expect(R.training_balls_price).toBe(legacy.TRAINING_BALLS_PRICE)
    expect(R.equipment_charge_start_date).toBe(legacy.EQUIPMENT_CHARGE_START_DATE)
  })

  it('price every slot the same as the legacy functions', () => {
    for (const h of SLOT_START_HOURS) {
      const slot = `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`
      expect(getPriceForSlot(R, slot)).toBe(legacy.getPriceForSlot(slot))
    }
  })
})

describe('slot pricing', () => {
  it('uses the hour grid', () => {
    expect(getSlotRateTier(R, '05:00-06:00')).toBe('offpeak')
    expect(getSlotRateTier(R, '06:00-07:00')).toBe('daytime')
    expect(getSlotRateTier(R, '17:00-18:00')).toBe('daytime')
    expect(getSlotRateTier(R, '18:00-19:00')).toBe('offpeak')
    expect(getSlotRateTier(R, '22:00-23:00')).toBe('latenight')
    expect(getSlotRateTier(R, '23:00-00:00')).toBe('latenight')
  })

  it('follows an edited grid and edited prices', () => {
    const rules: PricingRules = {
      ...R,
      tier_prices: { daytime: 220, offpeak: 270, latenight: 330 },
      hour_tiers: R.hour_tiers.map((t, i) => (i === 12 ? 'offpeak' : t)), // 17:00 becomes off-peak
    }
    expect(getPriceForSlot(rules, '17:00-18:00')).toBe(270)
    expect(getPriceForSlot(rules, '23:00-00:00')).toBe(330)
  })

  it('throws for an hour outside the grid', () => {
    expect(() => getSlotRateTier(R, '03:00-04:00')).toThrow()
  })
})

describe('equipment', () => {
  it('is free before the charge start date and charged on/after it', () => {
    expect(isEquipmentChargeable(R, '2026-05-31')).toBe(false)
    expect(isEquipmentChargeable(R, '2026-06-01')).toBe(true)
    expect(isEquipmentChargeable(R, undefined)).toBe(false)
  })

  it('is always charged when the start date is null', () => {
    expect(isEquipmentChargeable({ ...R, equipment_charge_start_date: null }, '2020-01-01')).toBe(true)
  })

  it('sums paddles, balls and training balls', () => {
    expect(calculateEquipmentCharge(R, { date: '2026-12-01', paddles: 2, needsBalls: true, trainingBalls: true })).toBe(225)
    expect(calculateEquipmentCharge(R, { date: '2026-05-01', paddles: 2, needsBalls: true })).toBe(0)
    expect(calculateEquipmentCharge(R, { date: '2026-12-01' })).toBe(0)
  })

  it('throws on a paddle count that is not a non-negative integer', () => {
    for (const paddles of [-3, 1.5, NaN, Infinity]) {
      expect(() => calculateEquipmentCharge(R, { date: '2026-12-01', paddles })).toThrow()
    }
  })
})

describe('calculatePaymentAmount', () => {
  it('adds slots, extra players and equipment', () => {
    // 200 + 250 + 2 extra players * 50 + 1 paddle 50
    expect(calculatePaymentAmount(R, ['17:00-18:00', '18:00-19:00'], 6, { date: '2026-12-01', paddles: 1 })).toBe(600)
  })

  it('matches the legacy function for the seed rules', () => {
    const eq = { date: '2026-12-01', paddles: 3, needsBalls: true, trainingBalls: false }
    expect(calculatePaymentAmount(R, ['05:00-06:00', '22:00-23:00'], 5, eq))
      .toBe(legacy.calculatePaymentAmount(['05:00-06:00', '22:00-23:00'], 5, eq))
  })
})

describe('calculateCancellationFee', () => {
  it('is free outside the window', () => {
    expect(calculateCancellationFee(R, 450, 2, 30)).toEqual({ cancellationFee: 0, refundAmount: 450 })
  })
  it('charges per slot inside the window, refund never negative', () => {
    expect(calculateCancellationFee(R, 450, 2, 10)).toEqual({ cancellationFee: 200, refundAmount: 250 })
    expect(calculateCancellationFee(R, 100, 2, 10)).toEqual({ cancellationFee: 200, refundAmount: 0 })
  })
  it('uses the rules window and fee', () => {
    const rules = { ...R, cancellation_window_hours: 48, cancellation_fee_per_slot: 150 }
    expect(calculateCancellationFee(rules, 500, 1, 30)).toEqual({ cancellationFee: 150, refundAmount: 350 })
  })
})

describe('pickPricingVersion', () => {
  const seed = version({ id: 'seed' })
  const dec = version({ id: 'dec', effective_from: '2026-12-01' })
  const decFix = version({ id: 'decFix', effective_from: '2026-12-01', created_at: '2026-11-20T00:00:00Z' })
  const jan = version({ id: 'jan', effective_from: '2027-01-01', cancelled_at: '2026-11-21T00:00:00Z' })

  it('picks the newest version on or before the play date', () => {
    expect(pickPricingVersion([seed, dec], '2026-11-30')?.id).toBe('seed')
    expect(pickPricingVersion([seed, dec], '2026-12-01')?.id).toBe('dec')
  })
  it('breaks same-day ties by newest created_at', () => {
    expect(pickPricingVersion([decFix, seed, dec], '2026-12-05')?.id).toBe('decFix')
  })
  it('ignores cancelled versions', () => {
    expect(pickPricingVersion([seed, jan], '2027-02-01')?.id).toBe('seed')
  })
  it('returns null when nothing applies', () => {
    expect(pickPricingVersion([dec], '2026-11-01')).toBeNull()
  })
  it('lists upcoming versions after today, soonest first', () => {
    expect(upcomingPricingVersions([jan, dec, seed], '2026-11-19').map((v) => v.id)).toEqual(['dec'])
  })
})

describe('rulesFromSnapshot', () => {
  it('uses the snapshot rules, or the seed for legacy rows', () => {
    const rules = { ...R, paddle_price: 80 }
    expect(rulesFromSnapshot({ version_id: 'x', rules })).toBe(rules)
    expect(rulesFromSnapshot(null)).toBe(R)
    expect(rulesFromSnapshot(undefined)).toBe(R)
  })
})

describe('describeTierHours', () => {
  it('describes the seed grid', () => {
    expect(describeTierHours(R)).toEqual({
      daytime: '6 AM - 6 PM',
      offpeak: '5 AM - 6 AM & 6 PM - 10 PM',
      latenight: '10 PM - 12 AM',
    })
  })
  it('returns an empty string for an unused tier', () => {
    const rules = { ...R, hour_tiers: R.hour_tiers.map((t) => (t === 'latenight' ? 'offpeak' : t)) }
    expect(describeTierHours(rules).latenight).toBe('')
  })
})

describe('isSamePricedSelection', () => {
  const a = { date: '2026-12-01', timeSlots: ['08:00-09:00', '07:00-08:00'], paddles: 1, needsBalls: false, trainingBalls: false }
  it('ignores slot order', () => {
    expect(isSamePricedSelection(a, { ...a, timeSlots: ['07:00-08:00', '08:00-09:00'] })).toBe(true)
  })
  it('detects any priced change', () => {
    expect(isSamePricedSelection(a, { ...a, date: '2026-12-02' })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, timeSlots: ['07:00-08:00'] })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, paddles: 2 })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, needsBalls: true })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, trainingBalls: true })).toBe(false)
  })
})

describe('diffPricingRules', () => {
  it('lists only changed fields with labels', () => {
    const next: PricingRules = {
      ...R,
      tier_prices: { ...R.tier_prices, daytime: 220 },
      hour_tiers: R.hour_tiers.map((t, i) => (i === 13 ? 'daytime' : t)), // 18:00
      equipment_charge_start_date: null,
    }
    expect(diffPricingRules(R, next)).toEqual([
      { label: 'Daytime rate', from: '₱200', to: '₱220' },
      { label: '18:00 slot', from: 'Off-peak', to: 'Daytime' },
      { label: 'Equipment charged from', from: '2026-06-01', to: 'Always' },
    ])
  })
  it('is empty when nothing changed', () => {
    expect(diffPricingRules(R, { ...R })).toEqual([])
  })
})

describe('strict slot parsing', () => {
  it.each(['garbage', '', '5 PM', '08:30-09:30', '8:30 AM', '25:00-26:00', '08:00 extra'])('rejects %j', (slot) => {
    expect(() => getSlotRateTier(R, slot)).toThrow(`Unrecognised time slot: ${slot}`)
  })
  it.each(['08:00-09:00', '08:00 - 09:00', '8:00-9:00', '8:00 AM - 9:00 AM', '12:00 PM', '12:00 pm'])('%j is daytime', (slot) => {
    expect(getSlotRateTier(R, slot)).toBe('daytime')
  })
  it('parses 12-hour evening and late-night slots', () => {
    expect(getSlotRateTier(R, '6:00 PM - 7:00 PM')).toBe('offpeak')
    expect(getSlotRateTier(R, '10:00 PM - 11:00 PM')).toBe('latenight')
    expect(getSlotRateTier(R, '5:00 AM')).toBe('offpeak')
  })
  it('still throws for hours outside 5-23', () => {
    expect(() => getSlotRateTier(R, '04:00-05:00')).toThrow()
  })
})

describe('assertValidPricingRules / rulesFromSnapshot validation', () => {
  const bad: Record<string, unknown> = {
    'short hour_tiers': { ...R, hour_tiers: R.hour_tiers.slice(0, 18) },
    'unknown tier': { ...R, hour_tiers: R.hour_tiers.map((t, i) => (i === 3 ? 'peak' : t)) },
    'fractional price': { ...R, tier_prices: { ...R.tier_prices, daytime: 200.5 } },
    'negative price': { ...R, paddle_price: -1 },
    'fractional cancellation window': { ...R, cancellation_window_hours: 1.5 },
    'negative base players': { ...R, base_players_included: -1 },
    'not an object': 'x',
  }
  it.each(Object.keys(bad))('rejects %s', (name) => {
    expect(() => assertValidPricingRules(bad[name])).toThrow('Invalid pricing snapshot')
    expect(() => rulesFromSnapshot({ version_id: 'x', rules: bad[name] as PricingRules })).toThrow('Invalid pricing snapshot')
  })
  it('accepts valid rules', () => {
    expect(() => assertValidPricingRules(R)).not.toThrow()
  })
})

describe('frozen parity with the launch prices', () => {
  const slotPrice = (hour: number) =>
    hour === 5 ? 250 : hour >= 6 && hour <= 17 ? 200 : hour >= 18 && hour <= 21 ? 250 : 300

  it('matches an inline formula for every combination', () => {
    const slots = generateTimeSlots()
    expect(slots).toHaveLength(19)
    for (const slot of slots) {
      const hour = parseInt(slot.slice(0, 2), 10)
      for (const format of [slot, slot.replace('-', ' - ')]) {
        for (let players = 1; players <= 10; players++) {
          for (const paddles of [0, 1, 2, 8]) {
            for (const needsBalls of [false, true]) {
              for (const trainingBalls of [false, true]) {
                for (const date of ['2026-05-31', '2026-06-01', '2027-01-01']) {
                  const equipmentOn = date >= '2026-06-01'
                  const expected =
                    slotPrice(hour) +
                    Math.max(0, players - 4) * 50 +
                    (equipmentOn ? paddles * 50 + (needsBalls ? 25 : 0) + (trainingBalls ? 100 : 0) : 0)
                  const actual = calculatePaymentAmount(R, [format], players, { date, paddles, needsBalls, trainingBalls })
                  if (actual !== expected) {
                    throw new Error(`${format} p${players} pad${paddles} b${needsBalls} t${trainingBalls} ${date}: ${actual} != ${expected}`)
                  }
                }
              }
            }
          }
        }
      }
    }
  })
})

describe('cancellation window boundary', () => {
  it('exactly 24h is inside the window (fee applies)', () => {
    expect(calculateCancellationFee(R, 450, 2, 24)).toEqual({ cancellationFee: 200, refundAmount: 250 })
  })
  it('23.99h is inside the window', () => {
    expect(calculateCancellationFee(R, 450, 2, 23.99).cancellationFee).toBe(200)
  })
  it('24.01h is free', () => {
    expect(calculateCancellationFee(R, 450, 2, 24.01)).toEqual({ cancellationFee: 0, refundAmount: 450 })
  })
})

describe('pickPricingVersion with several versions', () => {
  const base = version({ id: 'base' })
  const dec = version({ id: 'dec', effective_from: '2026-12-01' })
  const jan = version({ id: 'jan', effective_from: '2027-01-01' })
  const mid = version({ id: 'mid', effective_from: '2026-12-15', cancelled_at: '2026-11-01T00:00:00Z' })
  const all = [jan, mid, base, dec]
  it.each([
    ['2026-11-30', 'base'],
    ['2026-12-01', 'dec'],
    ['2026-12-15', 'dec'],
    ['2026-12-31', 'dec'],
    ['2027-01-01', 'jan'],
  ])('on %s picks %s', (date, id) => {
    expect(pickPricingVersion(all, date)?.id).toBe(id)
  })
  it('breaks created_at ties on the same day by parsed time, not string order', () => {
    const early = version({ id: 'early', effective_from: '2026-12-01', created_at: '2026-11-01T10:00:00Z' })
    const late = version({ id: 'late', effective_from: '2026-12-01', created_at: '2026-11-01T11:00:00+08:00' }) // 03:00Z, earlier
    // string compare would pick 'late' ("11:00" > "10:00"); real time says early is newer
    expect(pickPricingVersion([late, early], '2026-12-05')?.id).toBe('early')
    expect(pickPricingVersion([early, late], '2026-12-05')?.id).toBe('early')
  })
})
