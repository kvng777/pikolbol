/**
 * Server-side "can these slots be booked?" check used by every booking write path.
 * Combines closed dates, one-day blocks (disabled_slots) and slot rules. Fails closed.
 */
import { supabase } from './supabase-server'
import { getSlotRulesForDate, AvailabilityUnavailableError, AVAILABILITY_UNAVAILABLE } from './slotRulesService'
import { isRealDate } from './agent/dates'
import { findBlockingRule, ruleLabel, DEFAULT_RULE_LABEL } from './slotRules'

export const SLOTS_UNAVAILABLE = 'One or more selected slots are no longer available.'
export { AVAILABILITY_UNAVAILABLE }

export interface BlockedSlot {
  slot: string
  source: 'closed' | 'disabled' | 'rule'
  label: string
}

/** Requested slots that can't be booked on `date`. Throws AvailabilityUnavailableError if data can't be read. */
export async function findBlockedSlots(date: string, slots: string[]): Promise<BlockedSlot[]> {
  if (!isRealDate(date)) {
    console.error('Availability check: invalid date', date)
    throw new AvailabilityUnavailableError()
  }
  const [closed, disabled, rules] = await Promise.all([
    supabase.from('closed_dates').select('reason').lte('start_date', date).gte('end_date', date).limit(1),
    supabase.from('disabled_slots').select('time_slot').eq('date', date),
    getSlotRulesForDate(date),
  ])
  if (closed.error || disabled.error) {
    console.error('Availability check failed', closed.error ?? disabled.error)
    throw new AvailabilityUnavailableError()
  }

  if (closed.data && closed.data.length > 0) {
    const label = closed.data[0].reason || 'Closed'
    return slots.map((slot) => ({ slot, source: 'closed' as const, label }))
  }

  const disabledSet = new Set((disabled.data ?? []).map((d) => d.time_slot))
  const blocked: BlockedSlot[] = []
  for (const slot of slots) {
    if (disabledSet.has(slot)) {
      blocked.push({ slot, source: 'disabled', label: DEFAULT_RULE_LABEL })
      continue
    }
    const rule = findBlockingRule(rules, date, slot)
    if (rule) blocked.push({ slot, source: 'rule', label: ruleLabel(rule) })
  }
  return blocked
}

/** Blocks that still apply for an admin booking (only a literal `true` overrides): overriding skips rules and one-day blocks, never closed dates. */
export function blocksForAdmin(blocked: BlockedSlot[], overrideBlocks: unknown): BlockedSlot[] {
  return overrideBlocks === true ? blocked.filter((b) => b.source === 'closed') : blocked
}

/**
 * Human-readable list of blocks. Unlabeled blocks show just the slot, rule blocks add their label,
 * and a closed date is mentioned once (it blocks every slot for the same reason).
 */
export function describeBlocked(blocked: BlockedSlot[]): string {
  const parts = blocked
    .filter((b) => b.source !== 'closed')
    .map((b) => (b.label === DEFAULT_RULE_LABEL ? b.slot : `${b.slot} (${b.label})`))
  const closed = blocked.find((b) => b.source === 'closed')
  if (closed) parts.push(closed.label === 'Closed' ? 'the court is closed' : `the court is closed (${closed.label})`)
  return parts.join(', ')
}
