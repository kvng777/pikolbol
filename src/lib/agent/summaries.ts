import { parseISO } from 'date-fns'
import type { Booking, ClosedDate, DisabledSlot } from '@/types/booking'
import type { PaymentStatus } from '@/types/payment'
import {
  calculateCancellationFees,
  calculateDailyRevenue,
  calculateEquipmentBreakdown,
  calculateGrossRevenue,
  calculateNetRevenue,
  calculateTimeBreakdown,
  getPopularTimeSlots,
} from '@/lib/financeUtils'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'

/** Max booking groups returned to the model per call (token budget). */
export const MAX_GROUPS = 100
/** Only include a per-day series for ranges up to this many days. */
const MAX_DAILY_POINTS = 62

export interface BookingGroupSummary {
  shortId: string | null
  name: string
  date: string
  timeSlots: string[]
  status: PaymentStatus
  amount: number
  players: number
  isManual: boolean
  equipment: { paddles: number; balls: boolean; trainingBalls: boolean }
  refundStatus: string | null
}

/** One entry per order. Deliberately excludes email, phone and GCash reference. */
export function groupBookings(bookings: Booking[]): BookingGroupSummary[] {
  const groups = new Map<string, BookingGroupSummary>()
  for (const b of bookings) {
    const key = b.booking_group_id || b.id
    const existing = groups.get(key)
    if (existing) {
      existing.timeSlots.push(b.time_slot)
      continue
    }
    groups.set(key, {
      shortId: b.short_id ?? null,
      name: b.name,
      date: b.date,
      timeSlots: [b.time_slot],
      status: b.payment_status ?? 'pending',
      amount: b.payment_amount ?? 0,
      players: b.players,
      isManual: !!b.is_manual,
      equipment: {
        paddles: b.paddles_count ?? 0,
        balls: !!b.needs_balls,
        trainingBalls: !!b.training_balls,
      },
      refundStatus: b.refund_status ?? null,
    })
  }
  const result = [...groups.values()]
  for (const g of result) g.timeSlots.sort()
  return result
}

export function summarizeBookingList(bookings: Booking[], status?: PaymentStatus) {
  const filtered = status ? bookings.filter(b => (b.payment_status ?? 'pending') === status) : bookings
  const all = groupBookings(filtered)
  return {
    totalGroups: all.length,
    truncated: all.length > MAX_GROUPS,
    groups: all.slice(0, MAX_GROUPS),
  }
}

/** `bookings` must already be limited to [startDate, endDate]. */
export function summarizeRevenue(bookings: Booking[], startDate: string, endDate: string) {
  const daily = calculateDailyRevenue(bookings, { start: parseISO(startDate), end: parseISO(endDate) })
  return {
    period: { startDate, endDate },
    currency: 'PHP',
    grossRevenue: calculateGrossRevenue(bookings),
    cancellationFees: calculateCancellationFees(bookings),
    netRevenue: calculateNetRevenue(bookings),
    confirmedGroups: groupBookings(bookings.filter(b => b.payment_status === 'confirmed')).length,
    cancelledGroups: groupBookings(bookings.filter(b => b.payment_status === 'cancelled')).length,
    timeBreakdown: calculateTimeBreakdown(bookings),
    equipment: calculateEquipmentBreakdown(bookings),
    popularSlots: getPopularTimeSlots(bookings, 5),
    daily:
      daily.length <= MAX_DAILY_POINTS
        ? daily.map(d => ({ date: d.date, netRevenue: d.netRevenue, bookings: d.bookingsCount }))
        : null,
  }
}

/** `activeBookings` = pending + confirmed rows for `date` (what blocks a slot). */
export function summarizeAvailability(
  date: string,
  activeBookings: Booking[],
  disabledSlots: DisabledSlot[],
  closedDates: ClosedDate[]
) {
  const closed = closedDates.find(c => c.start_date <= date && date <= c.end_date)
  const slots = getAvailableSlotsForCourt(activeBookings, date, 1, disabledSlots, { ignorePast: true })
  return {
    date,
    closed: closed ? { reason: closed.reason } : null,
    available: slots.filter(s => s.available).map(s => s.time),
    booked: slots.filter(s => s.reason === 'booked').map(s => s.time),
    disabled: slots.filter(s => s.reason === 'disabled').map(s => s.time),
  }
}
