/**
 * Slot rules: pure logic shared by client and server.
 * A slot on date D is blocked by a rule when D is within [start_date, end_date],
 * D's ISO weekday is in weekdays, and the slot is in time_slots.
 */
import { formatHour } from './pricing'
import type { SlotRuleLike, SlotRuleStatus } from '@/types/slotRules'

export const DEFAULT_RULE_LABEL = 'Blocked'
/** Most bookings the rule-overlap check reads (the review dialog says "Showing the first N"). */
export const RULE_OVERLAP_LIMIT = 1000

/** Same date and the same slots, ignoring order. Duplicates in either list make them different. */
export function isSameSlotSelection(
  prevDate: string,
  prevSlots: readonly string[],
  date: string,
  slots: readonly string[]
): boolean {
  if (prevDate !== date) return false
  if (new Set(prevSlots).size !== prevSlots.length || new Set(slots).size !== slots.length) return false
  return prevSlots.length === slots.length && prevSlots.every((s) => slots.includes(s))
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** ISO weekday of a 'YYYY-MM-DD' date: 1 = Monday … 7 = Sunday. The date must be a valid zero-padded YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

/** Date must be a valid zero-padded YYYY-MM-DD. */
export function ruleAppliesOnDate(rule: Pick<SlotRuleLike, 'start_date' | 'end_date' | 'weekdays'>, date: string): boolean {
  if (date < rule.start_date) return false
  if (rule.end_date !== null && date > rule.end_date) return false
  return rule.weekdays.includes(isoWeekday(date))
}

/** The first rule that blocks `slot` on `date`, or null. */
export function findBlockingRule<R extends SlotRuleLike>(rules: R[], date: string, slot: string): R | null {
  return rules.find((r) => r.time_slots.includes(slot) && ruleAppliesOnDate(r, date)) ?? null
}

export function ruleLabel(rule: Pick<SlotRuleLike, 'label'>): string {
  return rule.label?.trim() || DEFAULT_RULE_LABEL
}

export function ruleStatus(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>, today: string): SlotRuleStatus {
  if (rule.end_date !== null && rule.end_date < today) return 'ended'
  if (rule.start_date > today) return 'upcoming'
  return 'active'
}

export function describeWeekdays(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b)
  const key = days.join(',')
  if (key === '1,2,3,4,5,6,7') return 'every day'
  if (key === '1,2,3,4,5') return 'weekdays'
  if (key === '6,7') return 'weekends'
  return days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')
}

/** '07:00-08:00' + '08:00-09:00' → '7 AM - 9 AM'. */
export function describeTimeSlots(slots: string[]): string {
  const starts = [...new Set(slots.map((s) => Number(s.slice(0, 2))))].sort((a, b) => a - b)
  const ranges: string[] = []
  let i = 0
  while (i < starts.length) {
    let j = i
    while (j + 1 < starts.length && starts[j + 1] === starts[j] + 1) j++
    ranges.push(`${formatHour(starts[i])} - ${formatHour(starts[j] + 1)}`)
    i = j + 1
  }
  return ranges.join(', ')
}

/** '2026-11-20' → 'Nov 20, 2026'. Date must be a valid zero-padded YYYY-MM-DD. */
export function formatRuleDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function describeRuleDates(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>): string {
  return rule.end_date === null
    ? `from ${formatRuleDate(rule.start_date)}`
    : `${formatRuleDate(rule.start_date)} – ${formatRuleDate(rule.end_date)}`
}

/** "Open Play: 7 AM - 11 AM, every day, from Nov 20, 2026" */
export function describeRule(rule: SlotRuleLike): string {
  return `${ruleLabel(rule)}: ${describeTimeSlots(rule.time_slots)}, ${describeWeekdays(rule.weekdays)}, ${describeRuleDates(rule)}`
}
