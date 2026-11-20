/**
 * Admin Time Slots tab: slot rule form <-> SlotRuleInput conversion, validation and list helpers.
 * Pure (no React) so it can be unit tested. Validation uses the same Zod schema as the
 * server (slotRuleInputSchema); the server stays authoritative.
 */
import { slotRuleInputSchema } from './slotRulesSchema'
import { generateTimeSlots } from './timeSlotGenerator'
import { formatRuleDate, isRuleHidden, ruleStatus } from './slotRules'
import { formatHour } from './pricing'
import type { SlotRule, SlotRuleInput, SlotRuleLike } from '@/types/slotRules'

export const RULE_SLOTS: readonly string[] = generateTimeSlots()
export const ALL_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]
export const WEEKDAY_SHORTCUTS: readonly { label: string; days: readonly number[] }[] = [
  { label: 'Every day', days: ALL_WEEKDAYS },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [6, 7] },
]

export interface SlotRuleFormValues {
  label: string
  startDate: string
  /** When true, endDate is ignored and the rule has no end. */
  noEnd: boolean
  endDate: string
  weekdays: number[]
  timeSlots: string[]
  hideFromCustomers: boolean
}

/** New rule: no label, every day, starting today, no end, no slots picked. Edit: the rule's values. */
export function initialSlotRuleFormValues(rule: SlotRuleLike | null | undefined, today: string): SlotRuleFormValues {
  if (!rule) {
    return {
      label: '',
      startDate: today,
      noEnd: true,
      endDate: '',
      weekdays: [...ALL_WEEKDAYS],
      timeSlots: [],
      hideFromCustomers: false,
    }
  }
  return {
    label: rule.label ?? '',
    startDate: rule.start_date,
    noEnd: rule.end_date === null,
    endDate: rule.end_date ?? '',
    weekdays: sortWeekdays(rule.weekdays),
    timeSlots: sortSlots(rule.time_slots),
    hideFromCustomers: isRuleHidden(rule),
  }
}

export const sortWeekdays = (days: readonly number[]): number[] => [...new Set(days)].sort((a, b) => a - b)

/** Unique, in grid (time) order. Unknown slots are kept at the end so the schema can report them. */
export function sortSlots(slots: readonly string[]): string[] {
  const order = (s: string) => {
    const i = RULE_SLOTS.indexOf(s)
    return i === -1 ? RULE_SLOTS.length : i
  }
  return [...new Set(slots)].sort((a, b) => order(a) - order(b))
}

/** Form values → action input. Empty label → null (customers see "Blocked"). */
export function formValuesToInput(values: SlotRuleFormValues): SlotRuleInput {
  const label = values.label.trim()
  return {
    label: label ? label : null,
    startDate: values.startDate,
    endDate: values.noEnd ? null : values.endDate,
    weekdays: sortWeekdays(values.weekdays),
    timeSlots: sortSlots(values.timeSlots),
    hideFromCustomers: values.hideFromCustomers === true,
  }
}

export type SlotRuleFormResult =
  | { ok: true; input: SlotRuleInput }
  /** errors: form field name → first message for that field. */
  | { ok: false; errors: Partial<Record<keyof SlotRuleFormValues | 'form', string>> }

/** Validates the form as the server will (same schema). */
export function validateSlotRuleForm(values: SlotRuleFormValues): SlotRuleFormResult {
  const errors: Partial<Record<keyof SlotRuleFormValues | 'form', string>> = {}
  if (!values.startDate) errors.startDate = 'Pick a start date'
  if (!values.noEnd && !values.endDate) errors.endDate = 'Pick an end date, or choose "No end date"'

  const parsed = slotRuleInputSchema.safeParse(formValuesToInput(values))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form') as keyof SlotRuleFormValues | 'form'
      if (!errors[key]) errors[key] = issue.message
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors }
  return { ok: true, input: parsed.data }
}

export function toggleWeekday(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : sortWeekdays([...days, day])
}

export function toggleSlot(slots: readonly string[], slot: string): string[] {
  return slots.includes(slot) ? slots.filter((s) => s !== slot) : sortSlots([...slots, slot])
}

/**
 * Drag-select: every slot from `anchor` to `current` (either direction, grid order) is added
 * (or removed) on top of the selection as it was when the drag started. Dragging back shrinks the range.
 */
export function applySlotDrag(base: readonly string[], anchor: string, current: string, adding: boolean): string[] {
  const a = RULE_SLOTS.indexOf(anchor)
  const b = RULE_SLOTS.indexOf(current)
  if (a === -1 || b === -1) return [...base]
  const range = RULE_SLOTS.slice(Math.min(a, b), Math.max(a, b) + 1)
  return adding ? sortSlots([...base, ...range]) : base.filter((s) => !range.includes(s))
}

/** '07:00-08:00' → '7 AM - 8 AM'. */
export function slotLabel(slot: string): string {
  const h = Number(slot.slice(0, 2))
  return `${formatHour(h)} - ${formatHour(h + 1)}`
}

/** Status badge text: 'Active', 'Starts Nov 25, 2026' or 'Ended'. */
export function ruleStatusText(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>, today: string): string {
  const status = ruleStatus(rule, today)
  if (status === 'upcoming') return `Starts ${formatRuleDate(rule.start_date)}`
  return status === 'active' ? 'Active' : 'Ended'
}

/** Active and upcoming rules first, ended last; otherwise keeps the server's order. */
export function sortRulesForList<R extends Pick<SlotRule, 'start_date' | 'end_date'>>(rules: readonly R[], today: string): R[] {
  const ended = (r: R) => (ruleStatus(r, today) === 'ended' ? 1 : 0)
  return [...rules].sort((a, b) => ended(a) - ended(b))
}

/**
 * Wording for the End confirmation. Mirrors endSlotRule: a rule that starts today or later
 * never applied, so ending it deletes it; otherwise its last day becomes yesterday.
 */
export function endRuleDescription(rule: Pick<SlotRuleLike, 'start_date'>, today: string): string {
  if (rule.start_date >= today) {
    return rule.start_date === today
      ? 'This rule starts today, so ending it removes it completely. Its slots open up again.'
      : `This rule hasn't started yet (it starts ${formatRuleDate(rule.start_date)}), so ending it removes it completely.`
  }
  return 'Its slots open up again from today. The rule stays in the list as ended (its last day becomes yesterday).'
}

/** End only makes sense for a rule that already started: otherwise it would just delete it (use Delete). */
export function canEndRule(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>, today: string): boolean {
  return ruleStatus(rule, today) === 'active' && rule.start_date < today
}

/** Delete confirmation wording: ended rules no longer block anything. */
export function deleteRuleDescription(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>, today: string): string {
  return ruleStatus(rule, today) === 'ended'
    ? 'The rule is removed from the list, including its history.'
    : 'The rule is removed completely, including its history, and its slots open up again.'
}

/** True when saving these values turns an ended rule back into an active or upcoming one. */
export function reactivatesRule(
  initial: Pick<SlotRuleLike, 'start_date' | 'end_date'> | null | undefined,
  input: Pick<SlotRuleInput, 'startDate' | 'endDate'>,
  today: string
): boolean {
  if (!initial || ruleStatus(initial, today) !== 'ended') return false
  return ruleStatus({ start_date: input.startDate, end_date: input.endDate }, today) !== 'ended'
}

/** Heading for the overlapping-bookings list in the save review. */
export function overlapSummary(count: number, truncated: boolean): string {
  if (count === 0) return 'No existing bookings fall in these slots.'
  const n = truncated ? `${count.toLocaleString('en-US')} or more` : count.toLocaleString('en-US')
  const noun = count === 1 && !truncated ? 'booking falls' : 'bookings fall'
  return `${n} existing ${noun} in these slots. They stay booked; contact the players if needed.`
}
