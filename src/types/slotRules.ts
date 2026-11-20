/** A reusable time-slot block. Dates are Asia/Manila play dates ('YYYY-MM-DD'). */
export interface SlotRule {
  id: string
  label: string | null        // null → customers see "Blocked"
  start_date: string
  end_date: string | null     // inclusive; null = no end
  weekdays: number[]          // ISO: 1 = Monday … 7 = Sunday
  time_slots: string[]        // '07:00-08:00' format
  /** true → customers don't see the blocked slots at all (still blocked on the server). */
  hide_from_customers: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A rule as returned to public callers (no audit fields such as created_by). */
export type PublicSlotRule = Omit<SlotRule, 'created_by'>

/**
 * What the rule logic needs (lets client code pass rules without audit fields).
 * `hide_from_customers` is optional here: a missing value (older rows, cached data) means false.
 */
export type SlotRuleLike = Pick<SlotRule, 'label' | 'start_date' | 'end_date' | 'weekdays' | 'time_slots'> &
  Partial<Pick<SlotRule, 'hide_from_customers'>>

/** Admin form / action input (camelCase, validated by slotRuleInputSchema). */
export interface SlotRuleInput {
  label: string | null
  startDate: string
  endDate: string | null
  weekdays: number[]
  timeSlots: string[]
  hideFromCustomers: boolean
}

/** An existing active booking that a rule would cover. */
export interface RuleOverlapBooking {
  shortId: string | null
  date: string
  timeSlot: string
  name: string
  status: string
}

/** Overlap check result; `truncated` means the row cap was hit, so more bookings may exist. */
export interface RuleOverlapResult {
  bookings: RuleOverlapBooking[]
  truncated: boolean
}

export type SlotRuleStatus = 'active' | 'upcoming' | 'ended'
