import { describe, it, expect } from 'vitest'
import type { Booking, ClosedDate, DisabledSlot } from '@/types/booking'
import {
  groupBookings,
  summarizeBookingList,
  summarizeRevenue,
  summarizeAvailability,
  MAX_GROUPS,
} from './summaries'

let n = 0
function booking(overrides: Partial<Booking> = {}): Booking {
  n += 1
  return {
    id: `b${n}`,
    name: 'Juan',
    phone: '09170000000',
    email: 'juan@example.com',
    date: '2026-10-20',
    time_slot: '06:00-07:00',
    court_number: 1,
    created_at: '2026-10-01T00:00:00Z',
    players: 4,
    payment_status: 'confirmed',
    payment_amount: 200,
    ...overrides,
  }
}

describe('groupBookings', () => {
  it('merges rows of the same group, sorts slots, counts amount once, omits PII', () => {
    const rows = [
      booking({ booking_group_id: 'g1', short_id: 'A1B2', time_slot: '08:00-09:00', payment_amount: 400 }),
      booking({ booking_group_id: 'g1', short_id: 'A1B2', time_slot: '07:00-08:00', payment_amount: 400 }),
    ]
    const groups = groupBookings(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      shortId: 'A1B2',
      timeSlots: ['07:00-08:00', '08:00-09:00'],
      amount: 400,
    })
    expect(JSON.stringify(groups)).not.toContain('juan@example.com')
    expect(JSON.stringify(groups)).not.toContain('09170000000')
  })

  it('treats rows without a group id as their own group', () => {
    expect(groupBookings([booking(), booking()])).toHaveLength(2)
  })
})

describe('summarizeBookingList', () => {
  it('filters by status', () => {
    const rows = [booking({ payment_status: 'pending' }), booking({ payment_status: 'confirmed' })]
    expect(summarizeBookingList(rows, 'pending').totalGroups).toBe(1)
  })

  it(`truncates to ${MAX_GROUPS} groups and flags it`, () => {
    const rows = Array.from({ length: MAX_GROUPS + 1 }, () => booking())
    const result = summarizeBookingList(rows)
    expect(result.totalGroups).toBe(MAX_GROUPS + 1)
    expect(result.truncated).toBe(true)
    expect(result.groups).toHaveLength(MAX_GROUPS)
  })
})

describe('summarizeRevenue', () => {
  it('matches Finance tab math: net = gross + retained cancellation fees', () => {
    const rows = [
      booking({ booking_group_id: 'g1', time_slot: '06:00-07:00', payment_amount: 450 }),
      booking({ booking_group_id: 'g1', time_slot: '07:00-08:00', payment_amount: 450 }),
      booking({ booking_group_id: 'g2', payment_status: 'cancelled', payment_amount: 200, cancellation_fee: 100 }),
    ]
    const result = summarizeRevenue(rows, '2026-10-01', '2026-10-31')
    expect(result.grossRevenue).toBe(450)
    expect(result.cancellationFees).toBe(100)
    expect(result.netRevenue).toBe(550)
    expect(result.confirmedGroups).toBe(1)
    expect(result.cancelledGroups).toBe(1)
  })
})

describe('summarizeAvailability', () => {
  const disabled: DisabledSlot[] = [
    { id: 'd1', date: '2026-10-20', time_slot: '07:00-08:00', created_at: '' },
  ]

  it('splits slots into available / booked / disabled', () => {
    const result = summarizeAvailability('2026-10-20', [booking()], disabled, [])
    expect(result.closed).toBeNull()
    expect(result.booked).toEqual(['06:00-07:00'])
    expect(result.disabled).toEqual(['07:00-08:00'])
    expect(result.available).not.toContain('06:00-07:00')
    expect(result.available).not.toContain('07:00-08:00')
    expect(result.available).toHaveLength(17) // 19 daily slots - 2
  })

  it('reports closed dates', () => {
    const closed: ClosedDate[] = [
      { id: 'c1', start_date: '2026-10-19', end_date: '2026-10-21', reason: 'Resurfacing', created_at: '' },
    ]
    expect(summarizeAvailability('2026-10-20', [], [], closed).closed).toEqual({ reason: 'Resurfacing' })
  })
})
