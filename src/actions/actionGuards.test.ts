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
import * as payment from './payment'
import * as paymentService from '@/lib/paymentService'
import * as paymentSettings from './paymentSettings'
import * as notice from './notice'
import * as profile from './profile'
import * as profileService from '@/lib/profileService'

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
  ['confirmPaymentAction', (t) => payment.confirmPaymentAction(t, ['b1'])],
  ['rejectPaymentAction', (t) => payment.rejectPaymentAction(t, ['b1'], 'r')],
  ['getPendingPaymentsAction', (t) => payment.getPendingPaymentsAction(t)],
  ['updatePaymentSettingsAction', (t) => paymentSettings.updatePaymentSettingsAction(t, { gcash_name: 'x' })],
  ['uploadQRCodeAction', (t) => paymentSettings.uploadQRCodeAction(t, new FormData())],
  ['getNoticeAction', (t) => notice.getNoticeAction(t)],
  ['updateNoticeAction', (t) => notice.updateNoticeAction(t, {})],
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

describe('submitPaymentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockReset()
    getProfileByUserId.mockReset()
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
    vi.mocked(paymentService.createBookingWithPendingPayment).mockResolvedValue({ success: false, error: 'x' })
  })

  const body = {
    name: 'X', phone: '0917', email: 'x@y.z', date: '2026-12-01',
    timeSlots: ['08:00 - 09:00'], courtNumber: 1, players: 4,
  }

  it('saves the user id from the verified token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    await payment.submitPaymentAction('tok', body)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' })
    )
  })

  it('books as a guest when there is no token', async () => {
    await payment.submitPaymentAction(null, body)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: undefined })
    )
  })
})

describe('getPaymentStatusAction', () => {
  it('returns only id and status', async () => {
    vi.mocked(paymentService.getPaymentStatusSummary).mockResolvedValue([{ id: 'b1', payment_status: 'pending' }])
    await expect(payment.getPaymentStatusAction(['b1'])).resolves.toEqual([{ id: 'b1', payment_status: 'pending' }])
  })
})

type UserCall = [name: string, call: (token: string) => Promise<unknown>]

const USER_ACTIONS: UserCall[] = [
  ['getMyBookingsAction', (t) => bookings.getMyBookingsAction(t)],
  ['cancelBookingGroupAction', (t) => bookings.cancelBookingGroupAction(t, 'g1', null)],
  ['createRescheduleRequestAction', (t) => bookings.createRescheduleRequestAction(t, 'g1', null, '2026-12-01', ['08:00 - 09:00'])],
  ['getMyPendingRescheduleRequestsAction', (t) => bookings.getMyPendingRescheduleRequestsAction(t)],
  ['getMyProfileAction', (t) => profile.getMyProfileAction(t)],
  ['upsertMyProfileAction', (t) => profile.upsertMyProfileAction(t, {})],
]

describe('customer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockReset()
    getProfileByUserId.mockReset()
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
  })

  it.each(USER_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('uses the user id from the token, not an argument', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.cancelBookingGroup).mockResolvedValue({ success: false, error: 'x' })
    await bookings.cancelBookingGroupAction('tok', 'g1', null)
    expect(bookingService.cancelBookingGroup).toHaveBeenCalledWith('g1', null, 'u1')
  })

  it("getMyBookingsAction reads the caller's bookings", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.getBookingsByUserId).mockResolvedValue([])
    await bookings.getMyBookingsAction('tok')
    expect(bookingService.getBookingsByUserId).toHaveBeenCalledWith('u1')
  })

  it('isCurrentUserAdminAction is false when signed out', async () => {
    await expect(profile.isCurrentUserAdminAction('')).resolves.toEqual({ isAdmin: false, role: null })
  })

  it("isCurrentUserAdminAction reports the caller's role", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    await expect(profile.isCurrentUserAdminAction('tok')).resolves.toEqual({ isAdmin: true, role: 'admin' })
  })

  it("upsertMyProfileAction writes to the caller's profile", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(profileService.upsertProfile).mockResolvedValue({ user_id: 'u1' } as never)
    await profile.upsertMyProfileAction('tok', { name: 'N' } as never)
    expect(profileService.upsertProfile).toHaveBeenCalledWith('u1', { name: 'N' })
  })
})
