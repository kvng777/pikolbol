/**
 * Admin Pricing tab: form <-> PricingRules conversion and validation.
 * Pure (no React) so it can be unit tested. Validation uses the same Zod
 * schema as the server (createPricingVersionSchema), so the admin sees the
 * server's rules inline before submitting.
 */
import { createPricingVersionSchema } from './pricingSchema'
import { maxPricingEffectiveFrom } from './pricing'
import { isRealDate } from './agent/dates'
import type { PricingRules } from '@/types/pricing'

/** Form shape: same as PricingRules except the equipment start date is '' when "always charged". */
export type PricingFormRules = Omit<PricingRules, 'equipment_charge_start_date'> & {
  equipment_charge_start_date: string
}

export interface PricingFormValues {
  rules: PricingFormRules
  mode: 'now' | 'schedule'
  /** Only used when mode = 'schedule'. */
  effectiveFrom: string
}

/** 'YYYY-MM-DD' + n days (UTC calendar math, no time zone involved). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function rulesToFormRules(rules: PricingRules): PricingFormRules {
  return {
    ...rules,
    tier_prices: { ...rules.tier_prices },
    hour_tiers: [...rules.hour_tiers],
    equipment_charge_start_date: rules.equipment_charge_start_date ?? '',
  }
}

export function formRulesToRules(form: PricingFormRules): PricingRules {
  return {
    ...form,
    tier_prices: { ...form.tier_prices },
    hour_tiers: [...form.hour_tiers],
    equipment_charge_start_date: form.equipment_charge_start_date.trim() || null,
  }
}

/** Prefill: rules of the version in effect, "apply now", schedule date defaulting to tomorrow. */
export function initialPricingFormValues(rules: PricingRules, today: string): PricingFormValues {
  return { rules: rulesToFormRules(rules), mode: 'now', effectiveFrom: addDaysIso(today, 1) }
}

export type PricingFormResult =
  | { ok: true; effectiveFrom: string; rules: PricingRules }
  /** errors: field path (e.g. 'rules.tier_prices.daytime') → first message for that field. */
  | { ok: false; errors: Record<string, string> }

/**
 * Validates the form as the server will. "Apply now" means effective today (Manila);
 * a scheduled date must be tomorrow … today + 2 years.
 */
export function validatePricingForm(values: PricingFormValues, today: string): PricingFormResult {
  const errors: Record<string, string> = {}
  const tomorrow = addDaysIso(today, 1)
  let effectiveFrom = today

  if (values.mode === 'schedule') {
    effectiveFrom = values.effectiveFrom
    if (!effectiveFrom || !isRealDate(effectiveFrom)) {
      errors.effectiveFrom = 'Pick the first play date for the new prices'
    } else if (effectiveFrom < tomorrow) {
      errors.effectiveFrom = 'Pick tomorrow or a later date (use "Apply now" for today)'
    } else if (effectiveFrom > maxPricingEffectiveFrom(today)) {
      errors.effectiveFrom = 'Pick a date at most 2 years ahead'
    }
  } else if (values.mode !== 'now') {
    errors.mode = 'Choose when the prices apply'
  }

  const rules = formRulesToRules(values.rules)
  const parsed = createPricingVersionSchema.safeParse({
    // A placeholder keeps date problems reported once, by the checks above.
    effectiveFrom: errors.effectiveFrom ? today : effectiveFrom,
    rules,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join('.') || 'rules'
      if (!(path in errors)) errors[path] = issue.message
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, effectiveFrom, rules: parsed.success ? parsed.data.rules : rules }
}

type ErrorTree = { [key: string]: ErrorTree | { type: string; message: string } }

/** Flat 'a.b.c' → message map to the nested shape react-hook-form expects. */
export function nestFieldErrors(flat: Record<string, string>): ErrorTree {
  const root: ErrorTree = {}
  for (const [path, message] of Object.entries(flat)) {
    const keys = path.split('.')
    let node = root
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        if (!(key in node)) node[key] = { type: 'validation', message }
      } else {
        const next = node[key]
        // A message already stored at a parent path is replaced by the nested field errors.
        if (!next || 'message' in next) node[key] = {}
        node = node[key] as ErrorTree
      }
    })
  }
  return root
}
