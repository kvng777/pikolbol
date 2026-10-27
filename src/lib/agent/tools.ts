import { tool } from 'ai'
import { z } from 'zod'
import {
  getActiveBookingsByDate,
  getBookingsInRange,
  getClosedDates,
  getDisabledSlotsByDate,
  getPendingRefunds,
  getPendingRescheduleRequests,
} from '@/lib/bookingService'
import { getPendingPayments } from '@/lib/paymentService'
import { isRealDate, validateDateRange } from './dates'
import { groupBookings, summarizeAvailability, summarizeBookingList, summarizeRevenue } from './summaries'

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
      'Which 1-hour slots on a date are available, booked (pending or confirmed), or disabled by an admin, ' +
      'and whether the whole date is closed.',
    inputSchema: z.object({ date: isoDate }),
    execute: async ({ date }) => {
      const [active, disabled, closed] = await Promise.all([
        getActiveBookingsByDate(date),
        getDisabledSlotsByDate(date),
        getClosedDates(),
      ])
      return summarizeAvailability(date, active, disabled, closed)
    },
  }),

  getActionQueue: tool({
    description:
      'Everything waiting on an admin right now: payments to verify, refunds to process, ' +
      'and reschedule requests to approve or reject.',
    inputSchema: z.object({}),
    execute: async () => {
      const [payments, refunds, reschedules] = await Promise.all([
        getPendingPayments(),
        getPendingRefunds(),
        getPendingRescheduleRequests(),
      ])
      return {
        pendingPayments: groupBookings(payments),
        pendingRefunds: groupBookings(refunds),
        rescheduleRequests: reschedules.map(r => ({
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
