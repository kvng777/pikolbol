/** A reusable time-slot block. Dates are Asia/Manila play dates ('YYYY-MM-DD'). */
export interface SlotRule {
  id: string
  label: string | null        // null → customers see "Blocked"
  start_date: string
  end_date: string | null     // inclusive; null = no end
  weekdays: number[]          // ISO: 1 = Monday … 7 = Sunday
  time_slots: string[]        // '07:00-08:00' format
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A rule as returned to public callers (no audit fields such as created_by). */
export type PublicSlotRule = Omit<SlotRule, 'created_by'>

/** What the rule logic needs (lets client code pass rules without audit fields). */
export type SlotRuleLike = Pick<SlotRule, 'label' | 'start_date' | 'end_date' | 'weekdays' | 'time_slots'>

/** Admin form / action input (camelCase, validated by slotRuleInputSchema). */
export interface SlotRuleInput {
  label: string | null
  startDate: string
  endDate: string | null
  weekdays: number[]
  timeSlots: string[]
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
