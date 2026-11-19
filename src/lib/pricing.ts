/**
 * Pricing math. Pure (no DB, no React): used by the client to display prices
 * and by the server to quote and save them. Every function takes the
 * PricingRules of the version that applies to the booking's play date.
 */
import type {
  RateTier,
  PricingRules,
  PricingVersion,
  PricingSnapshot,
  EquipmentSelection,
} from '@/types/pricing'

export const RATE_TIERS: readonly RateTier[] = ['daytime', 'offpeak', 'latenight']

export const RATE_TIER_LABELS: Record<RateTier, string> = {
  daytime: 'Daytime',
  offpeak: 'Off-peak',
  latenight: 'Late-night',
}

export const FIRST_SLOT_HOUR = 5
export const SLOT_COUNT = 19

/** How long a signed price quote stays valid (shared so the client can refresh before expiry). */
export const QUOTE_TTL_MS = 60 * 60 * 1000 // 60 minutes
/** The payment screen refreshes its quote this long after fetching it, 10 minutes before expiry. */
export const QUOTE_REFRESH_MS = QUOTE_TTL_MS - 10 * 60 * 1000
/** Start hour of every bookable slot: 5 … 23. */
export const SLOT_START_HOURS: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, i) => FIRST_SLOT_HOUR + i)

/**
 * Prices in effect before admin-managed pricing existed. Mirrors the seed row in
 * sql/pricing-schedules-migration.sql. Use ONLY for booking rows without a
 * pricing_snapshot (they were all priced with these values) — never as a
 * fallback when the pricing table can't be read.
 */
export const SEED_PRICING_RULES: PricingRules = {
  tier_prices: { daytime: 200, offpeak: 250, latenight: 300 },
  hour_tiers: [
    'offpeak',
    'daytime', 'daytime', 'daytime', 'daytime', 'daytime', 'daytime',
    'daytime', 'daytime', 'daytime', 'daytime', 'daytime', 'daytime',
    'offpeak', 'offpeak', 'offpeak', 'offpeak',
    'latenight', 'latenight',
  ],
  extra_player_charge: 50,
  base_players_included: 4,
  paddle_price: 50,
  ball_set_price: 25,
  training_balls_price: 100,
  equipment_charge_start_date: '2026-06-01',
  cancellation_fee_per_slot: 100,
  cancellation_window_hours: 24,
}

const SLOT_START_RE = /^\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s*(?:-.*)?$/i

/**
 * Strict start-hour parser. Accepts `H:MM`/`HH:MM` (24-hour) or `h:MM AM|PM`,
 * optionally followed by `-end` / ` - end` (ignored). Minutes must be 00.
 * Anything else throws (never guess a price).
 */
function parseSlotStartHour(timeSlot: string): number {
  const fail = () => new Error(`Unrecognised time slot: ${timeSlot}`)
  const m = typeof timeSlot === 'string' ? SLOT_START_RE.exec(timeSlot) : null
  if (!m || m[2] !== '00') throw fail()
  let hour = parseInt(m[1], 10)
  if (m[3]) {
    if (hour < 1 || hour > 12) throw fail()
    const pm = m[3].toUpperCase() === 'PM'
    hour = (hour % 12) + (pm ? 12 : 0)
  } else if (hour > 23) {
    throw fail()
  }
  return hour
}

export function getSlotRateTier(rules: PricingRules, timeSlot: string): RateTier {
  const hour = parseSlotStartHour(timeSlot)
  const tier = rules.hour_tiers[hour - FIRST_SLOT_HOUR]
  if (!tier) throw new Error(`No rate tier for slot "${timeSlot}"`)
  return tier
}

export function getPriceForSlot(rules: PricingRules, timeSlot: string): number {
  return rules.tier_prices[getSlotRateTier(rules, timeSlot)]
}

/** Equipment is charged for play dates on/after the start date (always, when it is null). */
export function isEquipmentChargeable(rules: PricingRules, date?: string): boolean {
  if (!date) return false
  return !rules.equipment_charge_start_date || date >= rules.equipment_charge_start_date
}

export function calculateEquipmentCharge(rules: PricingRules, equipment?: EquipmentSelection): number {
  if (!equipment || !isEquipmentChargeable(rules, equipment.date)) return 0
  const paddles = equipment.paddles ?? 0
  if (!Number.isInteger(paddles) || paddles < 0) {
    throw new Error(`Invalid paddle count: ${paddles}`)
  }
  return (
    paddles * rules.paddle_price +
    (equipment.needsBalls ? rules.ball_set_price : 0) +
    (equipment.trainingBalls ? rules.training_balls_price : 0)
  )
}

export function calculatePaymentAmount(
  rules: PricingRules,
  timeSlots: string[],
  playersCount: number,
  equipment?: EquipmentSelection
): number {
  const slots = timeSlots.reduce((total, slot) => total + getPriceForSlot(rules, slot), 0)
  const extraPlayers = Math.max(0, playersCount - rules.base_players_included)
  return slots + extraPlayers * rules.extra_player_charge + calculateEquipmentCharge(rules, equipment)
}

/**
 * Free cancellation more than `cancellation_window_hours` before the slot;
 * otherwise `cancellation_fee_per_slot` per slot is kept.
 */
export function calculateCancellationFee(
  rules: PricingRules,
  totalAmount: number,
  numberOfSlots: number,
  hoursUntilBooking: number
): { cancellationFee: number; refundAmount: number } {
  if (hoursUntilBooking > rules.cancellation_window_hours) {
    return { cancellationFee: 0, refundAmount: totalAmount }
  }
  // The fee can never exceed what was paid.
  const fee = Math.min(totalAmount, numberOfSlots * rules.cancellation_fee_per_slot)
  return { cancellationFee: fee, refundAmount: Math.max(0, totalAmount - fee) }
}

/** Newest non-cancelled version with effective_from <= date; same-day ties → newest created_at. */
export function pickPricingVersion(versions: PricingVersion[], date: string): PricingVersion | null {
  let best: PricingVersion | null = null
  for (const v of versions) {
    if (v.cancelled_at || v.effective_from > date) continue
    if (
      !best ||
      v.effective_from > best.effective_from ||
      (v.effective_from === best.effective_from && Date.parse(v.created_at) > Date.parse(best.created_at))
    ) {
      best = v
    }
  }
  return best
}

/** Non-cancelled versions starting after `today`, soonest first; same-date ties newest first (the one that applies). */
export function upcomingPricingVersions(versions: PricingVersion[], today: string): PricingVersion[] {
  return versions
    .filter((v) => !v.cancelled_at && v.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || Date.parse(b.created_at) - Date.parse(a.created_at))
}

/** Prices a saved booking was charged with (seed prices for rows from before snapshots). */
export function rulesFromSnapshot(snapshot: PricingSnapshot | null | undefined): PricingRules {
  if (snapshot == null) return SEED_PRICING_RULES
  assertValidPricingRules(snapshot.rules)
  return snapshot.rules
}

/** 'YYYY-MM-DD' that is a real calendar date. (Not agent/dates: keeps this module dependency-free.) */
const isIsoDate = (s: unknown): boolean => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const ms = Date.parse(s)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s
}

const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/**
 * Structural check for rules read from the DB (snapshots, schedules). Throws
 * 'Invalid pricing snapshot' rather than pricing from corrupt data.
 * (Not pricingSchema: that imports this module.)
 */
export function assertValidPricingRules(rules: unknown): asserts rules is PricingRules {
  const r = rules as Partial<Record<string, unknown>> | null
  const tp = r?.tier_prices as Record<string, unknown> | undefined
  const ok =
    !!r && typeof r === 'object' &&
    Array.isArray(r.hour_tiers) &&
    r.hour_tiers.length === SLOT_COUNT &&
    r.hour_tiers.every((t) => (RATE_TIERS as readonly unknown[]).includes(t)) &&
    !!tp && typeof tp === 'object' &&
    RATE_TIERS.every((t) => isMoney(tp[t])) &&
    [r.extra_player_charge, r.paddle_price, r.ball_set_price, r.training_balls_price, r.cancellation_fee_per_slot].every(isMoney) &&
    isMoney(r.base_players_included) &&
    isMoney(r.cancellation_window_hours) &&
    (r.equipment_charge_start_date === null || isIsoDate(r.equipment_charge_start_date))
  if (!ok) throw new Error('Invalid pricing snapshot')
}

/** 12-hour clock label, e.g. 5 → '5 AM', 18 → '6 PM', 24 → '12 AM'. */
export function formatHour(hour: number): string {
  const h = hour % 24
  const suffix = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${suffix}`
}

/** Human ranges per tier, e.g. { offpeak: '5 AM - 6 AM & 6 PM - 10 PM' }. '' when a tier has no hours. */
export function describeTierHours(rules: PricingRules): Record<RateTier, string> {
  const ranges: Record<RateTier, string[]> = { daytime: [], offpeak: [], latenight: [] }
  let i = 0
  while (i < SLOT_COUNT) {
    const tier = rules.hour_tiers[i]
    let j = i
    while (j + 1 < SLOT_COUNT && rules.hour_tiers[j + 1] === tier) j++
    ranges[tier].push(`${formatHour(FIRST_SLOT_HOUR + i)} - ${formatHour(FIRST_SLOT_HOUR + j + 1)}`)
    i = j + 1
  }
  return {
    daytime: ranges.daytime.join(' & '),
    offpeak: ranges.offpeak.join(' & '),
    latenight: ranges.latenight.join(' & '),
  }
}

export interface PricedSelection {
  date: string
  timeSlots: string[]
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
}

/**
 * True when nothing that affects the price changed (slot order ignored).
 * Ignores player count, so use it only for admin manual bookings (fixed player count).
 */
export function isSamePricedSelection(a: PricedSelection, b: PricedSelection): boolean {
  const slotsA = [...a.timeSlots].sort()
  const slotsB = [...b.timeSlots].sort()
  return (
    a.date === b.date &&
    slotsA.length === slotsB.length &&
    slotsA.every((s, i) => s === slotsB[i]) &&
    (a.paddles ?? 0) === (b.paddles ?? 0) &&
    !!a.needsBalls === !!b.needsBalls &&
    !!a.trainingBalls === !!b.trainingBalls
  )
}

export interface PricingChange {
  label: string
  from: string
  to: string
}

/** Peso amount as shown to admins and customers, e.g. ₱1,234. */
export const formatPeso = (n: number) => `₱${n.toLocaleString('en-US')}`
const peso = formatPeso

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM-DD' → 'Jun 1, 2026' (no time zone involved). */
function formatIsoDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/**
 * Latest start date an admin may pick: Manila today + 2 years (Feb 29 → Feb 28).
 * Shared by the server check and the admin date picker.
 */
export function maxPricingEffectiveFrom(today: string): string {
  const [y, m, d] = today.split('-')
  const candidate = `${Number(y) + 2}-${m}-${d}`
  return isIsoDate(candidate) ? candidate : `${Number(y) + 2}-${m}-28`
}

/** Changed fields between two rule sets, for the admin confirmation dialog. */
export function diffPricingRules(from: PricingRules, to: PricingRules): PricingChange[] {
  const changes: PricingChange[] = []
  const add = (label: string, a: string, b: string) => {
    if (a !== b) changes.push({ label, from: a, to: b })
  }

  for (const tier of RATE_TIERS) {
    add(`${RATE_TIER_LABELS[tier]} rate`, peso(from.tier_prices[tier]), peso(to.tier_prices[tier]))
  }
  SLOT_START_HOURS.forEach((hour, i) => {
    add(
      `${formatHour(hour)} - ${formatHour(hour + 1)} slot`,
      RATE_TIER_LABELS[from.hour_tiers[i]],
      RATE_TIER_LABELS[to.hour_tiers[i]]
    )
  })
  add('Extra player charge', peso(from.extra_player_charge), peso(to.extra_player_charge))
  add('Players included', String(from.base_players_included), String(to.base_players_included))
  add('Paddle', peso(from.paddle_price), peso(to.paddle_price))
  add('Ball set', peso(from.ball_set_price), peso(to.ball_set_price))
  add('Training balls', peso(from.training_balls_price), peso(to.training_balls_price))
  add(
    'Equipment charged from',
    from.equipment_charge_start_date ? formatIsoDate(from.equipment_charge_start_date) : 'Always',
    to.equipment_charge_start_date ? formatIsoDate(to.equipment_charge_start_date) : 'Always'
  )
  add('Cancellation fee per slot', peso(from.cancellation_fee_per_slot), peso(to.cancellation_fee_per_slot))
  add('Free cancellation window', `${from.cancellation_window_hours}h`, `${to.cancellation_window_hours}h`)
  return changes
}
