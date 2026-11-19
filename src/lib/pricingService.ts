/**
 * Pricing Service
 * Versioned prices in pricing_schedules (service role only).
 * Fails closed: unreadable, empty or invalid data throws PricingUnavailableError.
 */
import { supabase } from './supabase-server'
import { pricingRulesSchema, createPricingVersionSchema } from './pricingSchema'
import { pickPricingVersion } from './pricing'
import { manilaNow, isRealDate } from './agent/dates'
import type { PricingRules, PricingVersion } from '@/types/pricing'

export class PricingUnavailableError extends Error {
  constructor(message = 'Prices are unavailable right now. Please try again in a moment.') {
    super(message)
    this.name = 'PricingUnavailableError'
  }
}

interface PricingRow {
  id: string
  effective_from: string
  rules: unknown
  created_by: string | null
  created_at: string
  cancelled_at: string | null
}

function toVersion(row: PricingRow): PricingVersion {
  const parsed = pricingRulesSchema.safeParse(row.rules)
  if (!parsed.success) {
    console.error('Invalid pricing rules in pricing_schedules row', row.id, parsed.error.issues)
    throw new PricingUnavailableError()
  }
  return {
    id: row.id,
    effective_from: row.effective_from,
    rules: parsed.data,
    created_by: row.created_by,
    created_at: row.created_at,
    cancelled_at: row.cancelled_at,
  }
}

export function manilaToday(now: Date = new Date()): string {
  return manilaNow(now).date
}

/** All non-cancelled versions, oldest first. */
export async function getPricingVersions(): Promise<PricingVersion[]> {
  const { data, error } = await supabase
    .from('pricing_schedules')
    .select('*')
    .is('cancelled_at', null)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching pricing schedules:', error)
    throw new PricingUnavailableError()
  }
  if (!data || data.length === 0) {
    console.error('pricing_schedules has no active rows')
    throw new PricingUnavailableError()
  }
  return (data as PricingRow[]).map(toVersion)
}

/** One version by id, including cancelled ones (a quote may reference it). */
export async function getPricingVersionById(id: string): Promise<PricingVersion | null> {
  const { data, error } = await supabase.from('pricing_schedules').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('Error fetching pricing version:', error)
    throw new PricingUnavailableError()
  }
  return data ? toVersion(data as PricingRow) : null
}

/** The version that prices a given play date. */
export async function getPricingForDate(date: string): Promise<PricingVersion> {
  const version = pickPricingVersion(await getPricingVersions(), date)
  if (!version) throw new PricingUnavailableError()
  return version
}

/** Manila today + 2 years (Feb 29 falls back to Feb 28). */
function maxEffectiveFrom(now: Date): string {
  const [y, m, d] = manilaToday(now).split('-')
  const candidate = `${Number(y) + 2}-${m}-${d}`
  return isRealDate(candidate) ? candidate : `${Number(y) + 2}-${m}-28`
}

export async function createPricingVersion(
  input: { effectiveFrom: string; rules: PricingRules; createdBy: string },
  now: Date = new Date()
): Promise<{ success: true; version: PricingVersion } | { success: false; error: string }> {
  // A bad row would make getPricingVersions fail closed for every booking, so validate here too.
  const parsed = createPricingVersionSchema.safeParse({ effectiveFrom: input.effectiveFrom, rules: input.rules })
  if (!parsed.success) {
    return { success: false, error: 'Invalid prices' }
  }
  if (input.effectiveFrom < manilaToday(now)) {
    return { success: false, error: 'The start date cannot be in the past.' }
  }
  if (input.effectiveFrom > maxEffectiveFrom(now)) {
    return { success: false, error: 'The start date is too far ahead (2 years at most).' }
  }

  const { data, error } = await supabase
    .from('pricing_schedules')
    .insert({ effective_from: input.effectiveFrom, rules: input.rules, created_by: input.createdBy })
    .select()
    .single()

  if (error || !data) {
    console.error('Error creating pricing version:', error)
    return { success: false, error: 'Failed to save prices' }
  }
  try {
    return { success: true, version: toVersion(data as PricingRow) }
  } catch {
    return { success: false, error: 'Failed to save prices' }
  }
}

/** Cancel an upcoming version (effective_from after today). Versions in effect can't be cancelled. */
export async function cancelPricingVersion(
  id: string,
  now: Date = new Date()
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('pricing_schedules')
    .update({ cancelled_at: now.toISOString() })
    .eq('id', id)
    .is('cancelled_at', null)
    .gt('effective_from', manilaToday(now))
    .select('id')

  if (error) {
    console.error('Error cancelling pricing version:', error)
    return { success: false, error: 'Failed to cancel the price change' }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Only upcoming price changes can be cancelled.' }
  }
  return { success: true }
}
