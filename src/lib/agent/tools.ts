import { tool } from 'ai'
import { z } from 'zod'
import {
  getActiveBookingsByDate,
  getBookingsInRange,
  getPendingRefunds,
  getPendingRescheduleRequests,
} from '@/lib/bookingService'
import { getSlotRulesForDate } from '@/lib/slotRulesService'
import { findBlockedSlots } from '@/lib/slotAvailability'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'
import type { ClosedDate, DisabledSlot } from '@/types/booking'
import { getPendingPayments } from '@/lib/paymentService'
import { isRealDate, validateDateRange } from './dates'
import { MAX_GROUPS, summarizeAvailability, summarizeBookingList, summarizeRevenue } from './summaries'

const isoDate = z
  .string()
  .refine(isRealDate, 'Must be a real date in YYYY-MM-DD format')
  .describe('Date in YYYY-MM-DD (Asia/Manila)')

const paymentStatus = z.enum(['pending', 'confirmed', 'rejected', 'cancelled'])

function assertRange(startDate: string, endDate: string) {
  const check = validateDateRange(startDate, endDate)
  if (!check.ok) throw new Error(check.error)
}

/**
 * Read-only tools. Each one runs a fixed query through existing services, and none can write.
 * A thrown error becomes a tool error the model can see and explain.
 */
export const agentTools = {
  listBookings: tool({
    description:
      'List bookings between two dates (inclusive), one entry per order with all its time slots. ' +
      'Optionally filter by payment status. Returns at most 100 orders; if `truncated` is true, ' +
      'say so and suggest a narrower range or a status filter.',
    inputSchema: z.object({
      startDate: isoDate,
      endDate: isoDate,
      status: paymentStatus.optional(),
    }),
    execute: async ({ startDate, endDate, status }) => {
      assertRange(startDate, endDate)
      return summarizeBookingList(await getBookingsInRange(startDate, endDate), status)
    },
  }),

  getRevenueSummary: tool({
    description:
      'Revenue for a date range (inclusive), using the same math as the admin Finance tab: ' +
      'gross (confirmed orders), retained cancellation fees, net = gross + fees, ' +
      'daytime/off-peak/late-night split, equipment revenue, popular slots, and a daily series for ranges up to 62 days.',
    inputSchema: z.object({ startDate: isoDate, endDate: isoDate }),
    execute: async ({ startDate, endDate }) => {
      assertRange(startDate, endDate)
      return summarizeRevenue(await getBookingsInRange(startDate, endDate), startDate, endDate)
    },
  }),

  getSlotAvailability: tool({
    description:
      'Which 1-hour slots on a date are available, booked (pending or confirmed), disabled by an admin for that date, ' +
      'or blocked by a slot rule (with its label), and whether the whole date is closed. ' +
      'If this tool errors, availability is unknown: say so and never describe slots as free.',
    inputSchema: z.object({ date: isoDate }),
    execute: async ({ date }) => {
      // Fails closed: findBlockedSlots and getSlotRulesForDate throw if closed dates, one-day blocks or
      // rules can't be read, so the model sees a tool error instead of slots that look free.
      const [active, blocked, rules] = await Promise.all([
        getActiveBookingsByDate(date),
        findBlockedSlots(date, generateTimeSlots()),
        getSlotRulesForDate(date),
      ])
      const closedBlock = blocked.find(b => b.source === 'closed')
      const closed: ClosedDate[] = closedBlock
        ? [{ id: '', start_date: date, end_date: date, reason: closedBlock.label, created_at: '' }]
        : []
      const disabled: DisabledSlot[] = blocked
        .filter(b => b.source === 'disabled')
        .map(b => ({ id: '', date, time_slot: b.slot, created_at: '' }))
      return summarizeAvailability(date, active, disabled, closed, rules)
    },
  }),

  getActionQueue: tool({
    description:
      'Everything waiting on an admin right now: payments to verify, refunds to process, ' +
      'and reschedule requests to approve or reject. Each list returns at most 100 entries; ' +
      'compare totals (totalGroups, rescheduleTotal) and say so if anything was cut off.',
    inputSchema: z.object({}),
    execute: async () => {
      const [payments, refunds, reschedules] = await Promise.all([
        getPendingPayments(),
        getPendingRefunds(),
        getPendingRescheduleRequests(),
      ])
      return {
        pendingPayments: summarizeBookingList(payments),
        pendingRefunds: summarizeBookingList(refunds),
        rescheduleTotal: reschedules.length,
        rescheduleRequests: reschedules.slice(0, MAX_GROUPS).map(r => ({
          shortId: r.short_id,
          customerName: r.customer_name,
          from: { date: r.original_date, timeSlots: r.original_time_slots },
          to: { date: r.new_date, timeSlots: r.new_time_slots },
          requestedAt: r.created_at,
        })),
      }
    },
  }),
}

export type AgentTools = typeof agentTools
