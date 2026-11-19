import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, getProfileByUserId } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ supabase: { auth: { getUser } } }))
vi.mock('@/lib/profileService', () => ({
  getProfileByUserId,
  updateProfile: vi.fn(),
  upsertProfile: vi.fn(),
}))
// Automocked: every export becomes a vi.fn() returning undefined.
vi.mock('@/lib/bookingService')
vi.mock('@/lib/paymentService')
vi.mock('@/lib/paymentSettingsService')
vi.mock('@/lib/noticeService')
vi.mock('@/lib/emailService')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import * as bookings from './bookings'
import * as bookingService from '@/lib/bookingService'

type Call = [name: string, call: (token: string) => Promise<unknown>]

const payload = { name: 'X', date: '2026-12-01', timeSlots: ['08:00 - 09:00'] }

const ADMIN_ACTIONS: Call[] = [
  ['getAllBookingsAction', (t) => bookings.getAllBookingsAction(t)],
  ['deleteBookingAction', (t) => bookings.deleteBookingAction(t, 'id')],
  ['createAdminBookingAction', (t) => bookings.createAdminBookingAction(t, payload)],
  ['updateAdminBookingAction', (t) => bookings.updateAdminBookingAction(t, 'g1', payload)],
  ['addDisabledSlotAction', (t) => bookings.addDisabledSlotAction(t, '2026-12-01', '08:00 - 09:00')],
  ['removeDisabledSlotAction', (t) => bookings.removeDisabledSlotAction(t, 'id')],
  ['getAllDisabledSlotsAction', (t) => bookings.getAllDisabledSlotsAction(t)],
  ['addClosedDateAction', (t) => bookings.addClosedDateAction(t, '2026-12-01', '2026-12-02', 'r')],
  ['removeClosedDateAction', (t) => bookings.removeClosedDateAction(t, 'id')],
  ['getPendingRefundsAction', (t) => bookings.getPendingRefundsAction(t)],
  ['markRefundCompletedAction', (t) => bookings.markRefundCompletedAction(t, 'g1', null)],
  ['approveRescheduleRequestAction', (t) => bookings.approveRescheduleRequestAction(t, 'r1')],
  ['rejectRescheduleRequestAction', (t) => bookings.rejectRescheduleRequestAction(t, 'r1')],
  ['getPendingRescheduleRequestsAction', (t) => bookings.getPendingRescheduleRequestsAction(t)],
]

describe('admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(ADMIN_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it.each(ADMIN_ACTIONS)('%s rejects a signed-in non-admin', async (_name, call) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    await expect(call('tok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('does not touch the database when the guard fails', async () => {
    await expect(bookings.deleteBookingAction('', 'id')).rejects.toThrow()
    expect(bookingService.deleteBooking).not.toHaveBeenCalled()
  })

  it('runs the action for an admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    vi.mocked(bookingService.deleteBooking).mockResolvedValue({ success: true })
    await expect(bookings.deleteBookingAction('tok', 'id')).resolves.toEqual({ success: true })
    expect(bookingService.deleteBooking).toHaveBeenCalledWith('id')
  })
})
