import { z } from 'zod'
import { SLOT_COUNT } from './pricing'
import { MAX_PADDLES } from './paymentConfig'
import { isRealDate } from './agent/dates'
import { generateTimeSlots } from './timeSlotGenerator'

const rateTier = z.enum(['daytime', 'offpeak', 'latenight'])

const pesos = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label}: enter an amount` })
    .int(`${label}: whole pesos only`)
    .min(min, `${label}: minimum ₱${min}`)
    .max(max, `${label}: maximum ₱${max.toLocaleString()}`)

const isoDate = z.string().refine(isRealDate, 'Enter a valid date')

const pricingRulesBase = z.strictObject({
  tier_prices: z.strictObject({
    daytime: pesos('Daytime rate', 1, 10000),
    offpeak: pesos('Off-peak rate', 1, 10000),
    latenight: pesos('Late-night rate', 1, 10000),
  }),
  hour_tiers: z.array(rateTier).length(SLOT_COUNT, 'Every hour needs a rate tier'),
  extra_player_charge: pesos('Extra player charge', 0, 2000),
  base_players_included: z
    .number({ message: 'Players included: enter a number' })
    .int('Players included: whole number')
    .min(1, 'Players included: minimum 1')
    .max(20, 'Players included: maximum 20'),
  paddle_price: pesos('Paddle', 0, 2000),
  ball_set_price: pesos('Ball set', 0, 2000),
  training_balls_price: pesos('Training balls', 0, 5000),
  equipment_charge_start_date: isoDate.nullable(),
  cancellation_fee_per_slot: pesos('Cancellation fee', 0, 10000),
  cancellation_window_hours: z
    .number({ message: 'Cancellation window: enter hours' })
    .int('Cancellation window: whole hours')
    .min(0, 'Cancellation window: minimum 0')
    .max(168, 'Cancellation window: maximum 168 hours'),
})

export const pricingRulesSchema = pricingRulesBase.refine(
  (r) => r.cancellation_fee_per_slot <= Math.max(...Object.values(r.tier_prices)),
  { message: 'Cancellation fee: cannot exceed the highest slot rate', path: ['cancellation_fee_per_slot'] }
)

export const createPricingVersionSchema = z.strictObject({
  effectiveFrom: isoDate,
  rules: pricingRulesSchema,
})

// Real slot strings ("05:00-06:00" … "23:00-00:00"), the same format bookings store.
const VALID_SLOTS: ReadonlySet<string> = new Set(generateTimeSlots())
const timeSlot = z.string().refine((s) => VALID_SLOTS.has(s), 'Invalid time slot')

/** Booking details that a price quote is bound to (public input: validate strictly). */
export const quoteInputSchema = z.strictObject({
  date: isoDate,
  timeSlots: z
    .array(timeSlot)
    .min(1, 'Select at least one slot')
    .max(SLOT_COUNT)
    .refine((s) => new Set(s).size === s.length, 'Duplicate time slots'),
  players: z.number().int().min(1).max(30),
  paddles: z.number().int().min(0).max(MAX_PADDLES),
  needsBalls: z.boolean(),
  trainingBalls: z.boolean(),
})
