/**
 * Slot Rules Service (service role only).
 * Reads fail closed: a read error throws AvailabilityUnavailableError so booking writes reject.
 */
import { supabase } from './supabase-server'
import { slotRuleInputSchema } from './slotRulesSchema'
import { isoWeekday, ruleAppliesOnDate, RULE_OVERLAP_LIMIT } from './slotRules'
import { manilaNow, isRealDate } from './agent/dates'
import { addDaysIso } from './pricing'
import type { SlotRule, PublicSlotRule, SlotRuleInput, RuleOverlapResult } from '@/types/slotRules'

/** Shown when availability can't be read (the single source of this message). */
export const AVAILABILITY_UNAVAILABLE = 'Availability is unavailable right now. Please try again in a moment.'

export class AvailabilityUnavailableError extends Error {
  constructor() {
    super(AVAILABILITY_UNAVAILABLE)
    this.name = 'AvailabilityUnavailableError'
  }
}

export type SlotRuleResult = { success: true; rule: SlotRule } | { success: false; error: string }
export type EndSlotRuleResult = { success: true; deleted: boolean } | { success: false; error: string }

const COLUMNS = 'id, label, start_date, end_date, weekdays, time_slots, hide_from_customers, created_by, created_at, updated_at'
/** Same as COLUMNS without audit fields; safe for customer-facing reads. */
const PUBLIC_COLUMNS = 'id, label, start_date, end_date, weekdays, time_slots, hide_from_customers, created_at, updated_at'
/** Max overlapping bookings returned by the overlap check. */
const OVERLAP_LIMIT = RULE_OVERLAP_LIMIT
/** How far ahead the overlap check looks for rules without an end date. */
const OVERLAP_HORIZON_DAYS = 366

function readFailed(context: string, error: unknown): never {
  console.error(`Slot rules: ${context}`, error)
  throw new AvailabilityUnavailableError()
}

function parseInput(input: unknown): { ok: true; data: SlotRuleInput } | { ok: false; error: string } {
  const parsed = slotRuleInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule' }
  return { ok: true, data: parsed.data }
}

function toRow(input: SlotRuleInput) {
  return {
    label: input.label,
    start_date: input.startDate,
    end_date: input.endDate,
    weekdays: [...input.weekdays].sort((a, b) => a - b),
    time_slots: [...input.timeSlots].sort(),
    hide_from_customers: input.hideFromCustomers,
  }
}

/** All rules, newest start first (admin list). */
export async function listSlotRules(): Promise<SlotRule[]> {
  const { data, error } = await supabase.from('slot_rules').select(COLUMNS).order('start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id')
  if (error) readFailed('list', error)
  return (data ?? []) as SlotRule[]
}

/** Rules that are active or upcoming on/after `today` (what customer screens need). */
export async function listCurrentSlotRules(today: string): Promise<PublicSlotRule[]> {
  const { data, error } = await supabase
    .from('slot_rules')
    .select(PUBLIC_COLUMNS)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) readFailed('list current', error)
  return (data ?? []) as PublicSlotRule[]
}

/** Rules that block something on `date`. */
export async function getSlotRulesForDate(date: string): Promise<SlotRule[]> {
  if (!isRealDate(date)) readFailed('rules for date: invalid date', date)
  const { data, error } = await supabase
    .from('slot_rules')
    .select(COLUMNS)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) readFailed('rules for date', error)
  return ((data ?? []) as SlotRule[]).filter((r) => ruleAppliesOnDate(r, date))
}

export async function createSlotRule(input: unknown, createdBy: string | null): Promise<SlotRuleResult> {
  const parsed = parseInput(input)
  if (!parsed.ok) return { success: false, error: parsed.error }
  const { data, error } = await supabase
    .from('slot_rules')
    .insert({ ...toRow(parsed.data), created_by: createdBy })
    .select(COLUMNS)
    .single()
  if (error || !data) {
    console.error('Slot rules: create', error)
    return { success: false, error: 'Failed to save the rule' }
  }
  return { success: true, rule: data as SlotRule }
}

export async function updateSlotRule(id: string, input: unknown): Promise<SlotRuleResult> {
  const parsed = parseInput(input)
  if (!parsed.ok) return { success: false, error: parsed.error }
  const { data, error } = await supabase
    .from('slot_rules')
    .update({ ...toRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) {
    console.error('Slot rules: update', error)
    return { success: false, error: 'Failed to save the rule' }
  }
  if (!data) return { success: false, error: 'Rule not found' }
  return { success: true, rule: data as SlotRule }
}

/**
 * Stop a rule from today (Manila). A rule that already ran keeps its history (end_date = yesterday);
 * one that starts today or later never applied, so it is deleted.
 */
export async function endSlotRule(id: string, now: Date = new Date()): Promise<EndSlotRuleResult> {
  const today = manilaNow(now).date
  const yesterday = addDaysIso(today, -1)
  const { data: rule, error } = await supabase.from('slot_rules').select('start_date, end_date').eq('id', id).maybeSingle()
  if (error) {
    console.error('Slot rules: end (read)', error)
    return { success: false, error: 'Failed to end the rule' }
  }
  if (!rule) return { success: false, error: 'Rule not found' }
  if (rule.end_date !== null && rule.end_date < today) return { success: false, error: 'This rule has already ended.' }

  if (rule.start_date > yesterday) {
    const { data: gone, error: delError } = await supabase.from('slot_rules').delete().eq('id', id).select('id')
    if (delError) {
      console.error('Slot rules: end (delete)', delError)
      return { success: false, error: 'Failed to end the rule' }
    }
    if (!gone || gone.length === 0) return { success: false, error: 'Rule not found' }
    return { success: true, deleted: true }
  }
  const { data: updated, error: upError } = await supabase
    .from('slot_rules')
    .update({ end_date: yesterday, updated_at: now.toISOString() })
    .eq('id', id)
    .select('id')
  if (upError) {
    console.error('Slot rules: end (update)', upError)
    return { success: false, error: 'Failed to end the rule' }
  }
  if (!updated || updated.length === 0) return { success: false, error: 'Rule not found' }
  return { success: true, deleted: false }
}

export async function deleteSlotRule(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('slot_rules').delete().eq('id', id)
  if (error) {
    console.error('Slot rules: delete', error)
    return { success: false, error: 'Failed to delete the rule' }
  }
  return { success: true }
}

/**
 * Active (pending/confirmed) bookings a rule would cover, from today (Manila) onward.
 * Rules without an end date are checked up to OVERLAP_HORIZON_DAYS ahead.
 * `input` must already be parsed with `slotRuleInputSchema` (not re-validated here).
 * At most OVERLAP_LIMIT bookings are read; `truncated` is true when that cap was hit, so the list may be
 * incomplete (the weekday filter runs after the cap).
 */
export async function findBookingsOverlappingRule(input: SlotRuleInput, now: Date = new Date()): Promise<RuleOverlapResult> {
  const today = manilaNow(now).date
  const horizon = addDaysIso(today, OVERLAP_HORIZON_DAYS)
  const fromDate = input.startDate > today ? input.startDate : today
  const toDate = input.endDate === null || input.endDate > horizon ? horizon : input.endDate
  if (toDate < fromDate) return { bookings: [], truncated: false }

  const { data, error } = await supabase
    .from('bookings')
    .select('short_id, date, time_slot, name, payment_status')
    .gte('date', fromDate)
    .lte('date', toDate)
    .in('payment_status', ['pending', 'confirmed'])
    .in('time_slot', input.timeSlots)
    .order('date', { ascending: true })
    .order('time_slot', { ascending: true })
    .limit(OVERLAP_LIMIT)
  if (error) readFailed('overlap', error)

  const rows = data ?? []
  const bookings = rows
    .filter((b) => input.weekdays.includes(isoWeekday(b.date)))
    .map((b) => ({ shortId: b.short_id, date: b.date, timeSlot: b.time_slot, name: b.name, status: b.payment_status }))
  return { bookings, truncated: rows.length >= OVERLAP_LIMIT }
}
