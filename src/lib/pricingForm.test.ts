import { describe, it, expect } from 'vitest'
import {
  rulesToFormRules,
  formRulesToRules,
  initialPricingFormValues,
  validatePricingForm,
  nestFieldErrors,
  type PricingFormValues,
} from './pricingForm'
import { SEED_PRICING_RULES, maxPricingEffectiveFrom, addDaysIso } from './pricing'

const R = SEED_PRICING_RULES
const TODAY = '2026-11-19'

function form(over: Partial<PricingFormValues> = {}, rules: Partial<PricingFormValues['rules']> = {}): PricingFormValues {
  const base = initialPricingFormValues(R, TODAY)
  return { ...base, ...over, rules: { ...base.rules, ...rules } }
}

describe('addDaysIso', () => {
  it('crosses month, year and leap day boundaries', () => {
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('maxPricingEffectiveFrom', () => {
  it('is today + 2 years, Feb 29 falls back to Feb 28', () => {
    expect(maxPricingEffectiveFrom('2026-11-19')).toBe('2028-11-19')
    expect(maxPricingEffectiveFrom('2028-02-29')).toBe('2030-02-28')
  })
})

describe('rules <-> form rules', () => {
  it('round-trips, with null equipment date as empty string', () => {
    const rules = { ...R, equipment_charge_start_date: null }
    const f = rulesToFormRules(rules)
    expect(f.equipment_charge_start_date).toBe('')
    expect(formRulesToRules(f)).toEqual(rules)
    expect(formRulesToRules(rulesToFormRules(R))).toEqual(R)
  })
  it('copies arrays and nested objects (editing the form never mutates the source rules)', () => {
    const f = rulesToFormRules(R)
    f.hour_tiers[0] = 'latenight'
    f.tier_prices.daytime = 1
    expect(R.hour_tiers[0]).toBe('offpeak')
    expect(R.tier_prices.daytime).toBe(200)
  })
})

describe('initialPricingFormValues', () => {
  it('prefills rules, defaults to apply now and tomorrow', () => {
    const v = initialPricingFormValues(R, TODAY)
    expect(v.mode).toBe('now')
    expect(v.effectiveFrom).toBe('2026-11-20')
    expect(formRulesToRules(v.rules)).toEqual(R)
  })
})

describe('validatePricingForm', () => {
  it('apply now → effective today', () => {
    expect(validatePricingForm(form({}, { paddle_price: 60 }), TODAY)).toEqual({
      ok: true,
      effectiveFrom: TODAY,
      rules: { ...R, paddle_price: 60 },
      input: { mode: 'now', rules: { ...R, paddle_price: 60 } },
    })
  })

  it('apply now ignores the schedule date field', () => {
    const r = validatePricingForm(form({ effectiveFrom: '' }), TODAY)
    expect(r.ok).toBe(true)
  })

  it('schedule accepts tomorrow and the 2-year limit', () => {
    for (const d of ['2026-11-20', '2028-11-19']) {
      const r = validatePricingForm(form({ mode: 'scheduled', effectiveFrom: d }), TODAY)
      expect(r).toMatchObject({ ok: true, effectiveFrom: d, input: { mode: 'scheduled', effectiveFrom: d } })
    }
  })

  it('schedule rejects today, the past, blank, bad and too-far dates', () => {
    for (const d of [TODAY, '2026-11-01', '', '2026-02-30', '2028-11-20']) {
      const r = validatePricingForm(form({ mode: 'scheduled', effectiveFrom: d }), TODAY)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(Object.keys(r.errors)).toEqual(['effectiveFrom'])
    }
  })

  it('reports field errors at their form paths with the shared schema messages', () => {
    const r = validatePricingForm(
      form({}, { tier_prices: { ...R.tier_prices, daytime: NaN }, paddle_price: 1.5, equipment_charge_start_date: '2026-13-01' }),
      TODAY
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors['rules.tier_prices.daytime']).toBe('Daytime rate: enter an amount')
    expect(r.errors['rules.paddle_price']).toBe('Paddle: whole pesos only')
    expect(r.errors['rules.equipment_charge_start_date']).toBe('Enter a valid date')
  })

  it('rejects negative numbers', () => {
    const r = validatePricingForm(
      form({}, { tier_prices: { ...R.tier_prices, offpeak: -5 }, paddle_price: -1, cancellation_window_hours: -2 }),
      TODAY
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors['rules.tier_prices.offpeak']).toBe('Off-peak rate: minimum ₱1')
    expect(r.errors['rules.paddle_price']).toBe('Paddle: minimum ₱0')
    expect(r.errors['rules.cancellation_window_hours']).toBe('Cancellation window: minimum 0')
  })

  it('maps a whitespace-only equipment date to null (always charged)', () => {
    const r = validatePricingForm(form({}, { equipment_charge_start_date: '   ' }), TODAY)
    expect(r).toMatchObject({ ok: true, rules: { equipment_charge_start_date: null } })
    expect(formRulesToRules(form({}, { equipment_charge_start_date: '  ' }).rules).equipment_charge_start_date).toBeNull()
  })

  it('rejects an invalid mode', () => {
    const r = validatePricingForm(form({ mode: 'later' as never }), TODAY)
    expect(r).toEqual({ ok: false, errors: { mode: 'Choose when the prices apply' } })
  })

  it('applies the cross-field rule: cancellation fee ≤ highest slot rate', () => {
    const r = validatePricingForm(form({}, { cancellation_fee_per_slot: 301 }), TODAY)
    expect(r).toEqual({
      ok: false,
      errors: { 'rules.cancellation_fee_per_slot': 'Cancellation fee: cannot exceed the highest slot rate' },
    })
  })
})

describe('nestFieldErrors', () => {
  it('builds the nested react-hook-form error shape', () => {
    expect(
      nestFieldErrors({
        'rules.tier_prices.daytime': 'a',
        'rules.hour_tiers.3': 'b',
        effectiveFrom: 'c',
      })
    ).toEqual({
      rules: {
        tier_prices: { daytime: { type: 'validation', message: 'a' } },
        hour_tiers: { 3: { type: 'validation', message: 'b' } },
      },
      effectiveFrom: { type: 'validation', message: 'c' },
    })
  })

  it('replaces a parent message with nested child errors, whichever order they arrive in', () => {
    expect(nestFieldErrors({ 'rules.hour_tiers': 'parent', 'rules.hour_tiers.2': 'child' })).toEqual({
      rules: { hour_tiers: { 2: { type: 'validation', message: 'child' } } },
    })
    // Child first, parent second: the parent message is dropped.
    expect(nestFieldErrors({ 'rules.hour_tiers.2': 'child', 'rules.hour_tiers': 'parent' })).toEqual({
      rules: { hour_tiers: { 2: { type: 'validation', message: 'child' } } },
    })
  })
})
