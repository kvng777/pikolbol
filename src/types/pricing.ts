export type RateTier = 'daytime' | 'offpeak' | 'latenight'

/** Every editable price. Stored as JSON in pricing_schedules.rules and bookings.pricing_snapshot.rules. */
export interface PricingRules {
  tier_prices: Record<RateTier, number>     // PHP per 1-hour slot
  hour_tiers: RateTier[]                    // 19 entries: index 0 = 05:00 slot … index 18 = 23:00 slot
  extra_player_charge: number               // PHP per player beyond base_players_included
  base_players_included: number
  paddle_price: number                      // PHP per paddle, per booking
  ball_set_price: number                    // PHP per booking (set of 4)
  training_balls_price: number              // PHP per booking (50 balls w/ basket)
  equipment_charge_start_date: string | null // 'YYYY-MM-DD' play date from which equipment is charged; null = always
  cancellation_fee_per_slot: number         // PHP kept per slot when cancelling inside the window
  cancellation_window_hours: number         // Free cancellation if more than this many hours before the slot
}

export interface PricingVersion {
  id: string
  effective_from: string   // 'YYYY-MM-DD' (Manila play date)
  rules: PricingRules
  created_by: string | null
  created_at: string
  cancelled_at: string | null
}

/** Saved on each booking row: the prices that booking was charged with. */
export interface PricingSnapshot {
  version_id: string
  rules: PricingRules
}

export interface EquipmentSelection {
  date?: string           // Play date ('YYYY-MM-DD')
  paddles?: number
  needsBalls?: boolean
  trainingBalls?: boolean
}

/** Booking details a quote is bound to. */
export interface QuoteInput {
  date: string
  timeSlots: string[]
  players: number
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
}

/** Server-signed price the customer was shown. */
export interface PriceQuote {
  amount: number
  versionId: string
  expiresAt: number  // epoch ms
  token: string      // hex HMAC
}

/** Admin input to add a price version. "now" is resolved to today on the server (Manila). */
export type CreatePricingInput =
  | { mode: 'now'; rules: PricingRules }
  | { mode: 'scheduled'; effectiveFrom: string; rules: PricingRules }
