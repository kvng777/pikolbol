import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
vi.mock('@/lib/pricingService')
vi.mock('@/lib/priceQuote')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import * as bookings from './bookings'
import * as bookingService from '@/lib/bookingService'
import * as payment from './payment'
import * as paymentService from '@/lib/paymentService'
import * as paymentSettings from './paymentSettings'
import * as notice from './notice'
import * as profile from './profile'
import * as profileService from '@/lib/profileService'
import * as paymentSettingsService from '@/lib/paymentSettingsService'
import * as noticeService from '@/lib/noticeService'
import * as emailService from '@/lib/emailService'
import * as pricingActions from './pricing'
import * as pricingService from '@/lib/pricingService'
import * as priceQuote from '@/lib/priceQuote'
import { SEED_PRICING_RULES } from '@/lib/pricing'
import type { Profile } from '@/types/profile'

// Real quote signing for the submitPaymentAction tests (the module is automocked above).
const realPriceQuote = await vi.importActual<typeof import('@/lib/priceQuote')>('@/lib/priceQuote')

type Call = [name: string, call: (token: string) => Promise<unknown>]

const automockedModules = [bookingService, paymentService, paymentSettingsService, noticeService, emailService, pricingService, priceQuote]

/** Every function exported by the automocked service modules that was called at least once. */
function calledServiceFunctions(): string[] {
  const called: string[] = []
  for (const mod of automockedModules) {
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn === 'function' && vi.isMockFunction(fn) && fn.mock.calls.length > 0) called.push(name)
    }
  }
  return called
}

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
  ['createPricingVersionAction', (t) => pricingActions.createPricingVersionAction(t, { effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES })],
  ['cancelPricingVersionAction', (t) => pricingActions.cancelPricingVersionAction(t, 'v1')],
]

describe('admin actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it.each(ADMIN_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
    expect(calledServiceFunctions()).toEqual([])
  })

  it.each(ADMIN_ACTIONS)('%s rejects a signed-in non-admin', async (_name, call) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    await expect(call('tok')).rejects.toMatchObject({ code: 'forbidden' })
    expect(calledServiceFunctions()).toEqual([])
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
  const body = {
    name: 'X', phone: '0917', email: 'x@y.z', date: '2026-12-01',
    timeSlots: ['08:00-09:00'], courtNumber: 1, players: 2,
    paddles: 0, needsBalls: false, trainingBalls: false,
  }
  const quoteInput = { date: body.date, timeSlots: body.timeSlots, players: 2, paddles: 0, needsBalls: false, trainingBalls: false }
  const version = { id: 'v1', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: null, created_at: 'x', cancelled_at: null }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('PRICE_QUOTE_SECRET', 'q'.repeat(64))
    // priceQuote is automocked for the guard tests; use the real signing here.
    vi.mocked(priceQuote.createPriceQuote).mockImplementation(realPriceQuote.createPriceQuote)
    vi.mocked(priceQuote.verifyPriceQuote).mockImplementation(realPriceQuote.verifyPriceQuote)
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
    vi.mocked(pricingService.getPricingVersionById).mockResolvedValue(version)
    vi.mocked(paymentService.createBookingWithPendingPayment).mockResolvedValue({ success: false, error: 'x' })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('saves the quoted amount and snapshot, linked to the verified user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction('tok', body, quote)
    expect(pricingService.getPricingVersionById).toHaveBeenCalledWith('v1')
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        payment_amount: quote.amount,
        pricing_snapshot: { version_id: 'v1', rules: SEED_PRICING_RULES },
      })
    )
  })

  it('saves the quoted amount even if the version now prices differently', async () => {
    // Prices changed after the quote was issued: the customer still pays what they were shown.
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const changed = { ...SEED_PRICING_RULES, tier_prices: { daytime: 999, offpeak: 999, latenight: 999 } }
    vi.mocked(pricingService.getPricingVersionById).mockResolvedValue({ ...version, rules: changed })
    await payment.submitPaymentAction(null, body, quote)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ payment_amount: quote.amount })
    )
  })

  it('accepts the quote when slots arrive in a different order', async () => {
    const twoSlots = ['09:00-10:00', '08:00-09:00']
    const quote = priceQuote.createPriceQuote({ ...quoteInput, timeSlots: [...twoSlots].reverse() }, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction(null, { ...body, timeSlots: twoSlots }, quote)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ payment_amount: quote.amount, timeSlots: twoSlots })
    )
  })

  it('books as a guest when there is no token', async () => {
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction(null, body, quote)
    expect(getUser).not.toHaveBeenCalled()
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: undefined, payment_amount: quote.amount })
    )
  })

  it('books as a guest when the token fails verification', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction('bad-token', body, quote)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: undefined })
    )
    expect(warn).toHaveBeenCalledWith('submitPayment: access token rejected, booking as guest')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('bad-token')
    warn.mockRestore()
  })

  it('rejects a tampered quote with quote_invalid and creates nothing', async () => {
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, body, { ...quote, amount: 1 })
    expect(result).toMatchObject({ success: false, code: 'quote_invalid' })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('rejects an expired quote with quote_invalid and creates nothing', async () => {
    const issuedAt = Date.now() - realPriceQuote.QUOTE_TTL_MS - 1000
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1', issuedAt)
    const result = await payment.submitPaymentAction(null, body, quote)
    expect(result).toMatchObject({ success: false, code: 'quote_invalid', error: expect.stringMatching(/expired/i) })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('rejects a quote for different booking details', async () => {
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, { ...body, paddles: 2 }, quote)
    expect(result).toMatchObject({ success: false, code: 'quote_invalid' })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('rejects a quote whose price version no longer exists', async () => {
    vi.mocked(pricingService.getPricingVersionById).mockResolvedValue(null)
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, body, quote)
    expect(result).toMatchObject({ success: false, code: 'quote_invalid' })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('rejects invalid booking details before checking anything', async () => {
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, { ...body, timeSlots: ['nope'] }, quote)
    expect(result.success).toBe(false)
    expect(bookingService.isDateClosed).not.toHaveBeenCalled()
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('fails closed when the secret is missing', async () => {
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    vi.stubEnv('PRICE_QUOTE_SECRET', '')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await payment.submitPaymentAction(null, body, quote)
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('code')
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('fails closed when prices cannot be loaded', async () => {
    vi.mocked(pricingService.getPricingVersionById).mockRejectedValue(new Error('down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const quote = priceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, body, quote)
    expect(result.success).toBe(false)
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('getPaymentStatusAction', () => {
  it('returns only id and status', async () => {
    vi.mocked(paymentService.getPaymentStatusSummary).mockResolvedValue([{ id: 'b1', payment_status: 'pending' }])
    await expect(payment.getPaymentStatusAction(['b1'])).resolves.toEqual([{ id: 'b1', payment_status: 'pending' }])
  })
})

const USER_ACTIONS: Call[] = [
  ['getMyBookingsAction', (t) => bookings.getMyBookingsAction(t)],
  ['cancelBookingGroupAction', (t) => bookings.cancelBookingGroupAction(t, 'g1', null)],
  ['createRescheduleRequestAction', (t) => bookings.createRescheduleRequestAction(t, 'g1', null, '2026-12-01', ['08:00 - 09:00'])],
  ['getMyPendingRescheduleRequestsAction', (t) => bookings.getMyPendingRescheduleRequestsAction(t)],
  ['getMyProfileAction', (t) => profile.getMyProfileAction(t)],
  ['upsertMyProfileAction', (t) => profile.upsertMyProfileAction(t, {})],
]

describe('customer actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
  })

  it.each(USER_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it.each(USER_ACTIONS)('%s rejects a token that fails verification', async (_name, call) => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') })
    await expect(call('tok')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('createRescheduleRequestAction uses the token user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.createRescheduleRequest).mockResolvedValue({ success: false, error: 'x' })
    await bookings.createRescheduleRequestAction('tok', 'g1', null, '2026-12-01', ['08:00 - 09:00'])
    expect(bookingService.createRescheduleRequest).toHaveBeenCalledWith(
      'g1', null, 'u1', '2026-12-01', ['08:00 - 09:00']
    )
  })

  it('getMyPendingRescheduleRequestsAction uses the token user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.getPendingRescheduleRequestsByUser).mockResolvedValue([])
    await bookings.getMyPendingRescheduleRequestsAction('tok')
    expect(bookingService.getPendingRescheduleRequestsByUser).toHaveBeenCalledWith('u1')
  })

  it('getMyProfileAction uses the token user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ user_id: 'u1', role: 'user' })
    await profile.getMyProfileAction('tok')
    expect(getProfileByUserId).toHaveBeenCalledWith('u1')
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
    vi.mocked(profileService.upsertProfile).mockResolvedValue({ user_id: 'u1' } as Profile)
    await profile.upsertMyProfileAction('tok', { name: 'N' })
    expect(profileService.upsertProfile).toHaveBeenCalledWith('u1', { name: 'N' })
  })

  it('upsertMyProfileAction never passes an injected role to the service', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(profileService.upsertProfile).mockResolvedValue({ user_id: 'u1' } as Profile)
    const injected = { name: ' N ', phone: '0917', role: 'admin' } as { name: string; phone: string }
    await profile.upsertMyProfileAction('tok', injected)
    expect(profileService.upsertProfile).toHaveBeenCalledWith('u1', { name: 'N', phone: '0917' })
  })

  it('upsertMyProfileAction rejects an over-long name without calling the service', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    await expect(profile.upsertMyProfileAction('tok', { name: 'a'.repeat(101) })).resolves.toEqual({
      success: false,
      error: 'Invalid profile details',
    })
    expect(profileService.upsertProfile).not.toHaveBeenCalled()
  })
})

describe('getActiveBookingsByDateAction (public)', () => {
  it('returns slot occupancy only', async () => {
    const rows = [{ date: '2026-12-01', time_slot: '08:00 - 09:00', court_number: 1, booking_group_id: 'g1' }]
    vi.mocked(bookingService.getActiveSlotOccupancyByDate).mockResolvedValue(rows)
    await expect(bookings.getActiveBookingsByDateAction('2026-12-01')).resolves.toEqual(rows)
    expect(bookingService.getActiveBookingsByDate).not.toHaveBeenCalled()
  })
})

describe('pricing actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
  })

  it('createPricingVersionAction records the admin and validates first', async () => {
    vi.mocked(pricingService.createPricingVersion).mockResolvedValue({ success: true, version: {} as never })
    await pricingActions.createPricingVersionAction('tok', { effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES })
    expect(pricingService.createPricingVersion).toHaveBeenCalledWith({
      effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES, createdBy: 'admin-1',
    })
  })

  it('createPricingVersionAction rejects invalid prices without touching the DB', async () => {
    const result = await pricingActions.createPricingVersionAction('tok', {
      effectiveFrom: '2026-12-01',
      rules: { ...SEED_PRICING_RULES, paddle_price: -1 },
    })
    expect(result.success).toBe(false)
    expect(pricingService.createPricingVersion).not.toHaveBeenCalled()
  })

  it('getPricingVersionsAction hides who created each version', async () => {
    vi.mocked(pricingService.getPricingVersions).mockResolvedValue([
      { id: 'v', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: 'admin-1', created_at: 'x', cancelled_at: null },
    ])
    const result = await pricingActions.getPricingVersionsAction()
    expect(result).toMatchObject({ success: true, versions: [{ id: 'v', created_by: null }] })
  })

  it('getPricingVersionsAction reports unavailability instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(pricingService.getPricingVersions).mockRejectedValue(new Error('down'))
    await expect(pricingActions.getPricingVersionsAction()).resolves.toMatchObject({ success: false })
  })

  it('getPriceQuoteAction rejects bad input without loading prices', async () => {
    const result = await pricingActions.getPriceQuoteAction({
      date: 'nope', timeSlots: [], players: 2, paddles: 0, needsBalls: false, trainingBalls: false,
    })
    expect(result.success).toBe(false)
    expect(pricingService.getPricingForDate).not.toHaveBeenCalled()
  })

  it('getPriceQuoteAction returns a quote for valid input', async () => {
    const quote = { amount: 200, versionId: 'v', expiresAt: 1, token: 'ab' }
    vi.mocked(pricingService.getPricingForDate).mockResolvedValue({ id: 'v', rules: SEED_PRICING_RULES } as never)
    vi.mocked(priceQuote.createPriceQuote).mockReturnValue(quote)
    await expect(
      pricingActions.getPriceQuoteAction({
        date: '2026-12-01', timeSlots: ['08:00-09:00'], players: 2, paddles: 0, needsBalls: false, trainingBalls: false,
      })
    ).resolves.toEqual({ success: true, quote })
  })
})
