import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SEED_PRICING_RULES, calculatePaymentAmount } from './pricing'
import type { PricingRules } from '@/types/pricing'

const { from, getPricingForDate } = vi.hoisted(() => ({ from: vi.fn(), getPricingForDate: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ supabase: { from } }))
vi.mock('./supabase-server', () => ({ supabase: { from } }))
vi.mock('./pricingService', () => ({ getPricingForDate }))
vi.mock('./bookingIdGenerator', () => ({
  generateUniqueShortId: vi.fn(async () => 'SHORT1'),
  generateBookingGroupId: vi.fn(() => 'new-group'),
}))
vi.mock('./emailService', () => ({
  sendAdminRefundAlertEmail: vi.fn(),
  sendUserRefundCompletedEmail: vi.fn(),
  sendRescheduleNotificationEmail: vi.fn(),
  sendRescheduleApprovedEmail: vi.fn(),
  sendRescheduleRejectedEmail: vi.fn(),
}))
vi.mock('./paymentSettingsService', () => ({ getPaymentSettings: vi.fn() }))

import { createAdminBooking, updateAdminBooking, approveRescheduleRequest, cancelBookingGroup } from './bookingService'

const DATE = '2026-12-01'
const RULES: PricingRules = { ...SEED_PRICING_RULES, tier_prices: { ...SEED_PRICING_RULES.tier_prices, daytime: 999 } }
const VERSION = { id: 'v2', effective_from: '2026-11-01', rules: RULES, created_by: null, created_at: '', cancelled_at: null }
const OLD_SNAPSHOT = { version_id: 'old', rules: SEED_PRICING_RULES }

interface Ops { inserted: Record<string, unknown>[]; deleted: boolean }

/** Chainable bookings stub: selects resolve to `selectData`, inserts are recorded. */
function setup(selectData: unknown[], extra: Record<string, unknown> = {}) {
  const ops: Ops = { inserted: [], deleted: false }
  from.mockImplementation((table: string) => {
    const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
    let mode: 'select' | 'insert' | 'delete' = 'select'
    for (const m of ['select', 'eq', 'in', 'order', 'update']) q[m] = vi.fn(() => q)
    q.insert = vi.fn((rows: Record<string, unknown>[]) => { mode = 'insert'; ops.inserted = rows; return q })
    q.delete = vi.fn(() => { mode = 'delete'; ops.deleted = true; return q })
    q.single = vi.fn(() => Promise.resolve({ data: extra[table] ?? null, error: null }))
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(
        mode === 'insert' ? { data: ops.inserted, error: null }
          : mode === 'delete' ? { error: null }
          : { data: table === 'bookings' ? selectData : [], error: null }
      ).then(res, rej)
    return q
  })
  return ops
}

const existingRow = (over: Record<string, unknown> = {}) => ({
  id: 'b1', name: 'Ann', phone: '', email: '', date: DATE, time_slot: '10:00', court_number: 1, players: 2,
  paddles_count: 0, needs_balls: false, training_balls: false, user_id: null, short_id: 'S1',
  booking_group_id: 'g1', payment_status: 'confirmed', payment_amount: 123, payment_confirmed_at: 'x',
  pricing_snapshot: OLD_SNAPSHOT, is_manual: true, ...over,
})

describe('admin bookings pricing', () => {
  beforeEach(() => { from.mockReset(); getPricingForDate.mockReset() })

  it('createAdminBooking prices from the schedule and saves the snapshot', async () => {
    getPricingForDate.mockResolvedValue(VERSION)
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00', '11:00'] })
    expect(res.success).toBe(true)
    expect(getPricingForDate).toHaveBeenCalledWith(DATE)
    const expected = calculatePaymentAmount(RULES, ['10:00', '11:00'], 2, { date: DATE, paddles: 0, needsBalls: false, trainingBalls: false })
    expect(ops.inserted[0].payment_amount).toBe(expected)
    expect(ops.inserted[0].pricing_snapshot).toEqual({ version_id: 'v2', rules: RULES })
  })

  it('createAdminBooking fails and saves nothing when pricing is unavailable', async () => {
    getPricingForDate.mockRejectedValue(new Error('down'))
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00'] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Prices are unavailable/)
    expect(ops.inserted).toHaveLength(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('updateAdminBooking keeps amount and snapshot for a name-only edit', async () => {
    const ops = setup([existingRow()])
    const res = await updateAdminBooking('g1', { name: 'Bob', date: DATE, timeSlots: ['10:00'] })
    expect(res.success).toBe(true)
    expect(getPricingForDate).not.toHaveBeenCalled()
    expect(ops.inserted[0].payment_amount).toBe(123)
    expect(ops.inserted[0].pricing_snapshot).toEqual(OLD_SNAPSHOT)
  })

  it('updateAdminBooking re-prices when slots change', async () => {
    getPricingForDate.mockResolvedValue(VERSION)
    const ops = setup([existingRow()])
    const res = await updateAdminBooking('g1', { name: 'Ann', date: DATE, timeSlots: ['10:00', '11:00'] })
    expect(res.success).toBe(true)
    expect(ops.inserted[0].payment_amount).toBe(
      calculatePaymentAmount(RULES, ['10:00', '11:00'], 2, { date: DATE, paddles: 0, needsBalls: false, trainingBalls: false })
    )
    expect(ops.inserted[0].pricing_snapshot).toEqual({ version_id: 'v2', rules: RULES })
  })

  it('updateAdminBooking fails before deleting when re-pricing is unavailable', async () => {
    getPricingForDate.mockRejectedValue(new Error('down'))
    const ops = setup([existingRow()])
    const res = await updateAdminBooking('g1', { name: 'Ann', date: DATE, timeSlots: ['10:00'], trainingBalls: true })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Prices are unavailable/)
    expect(ops.deleted).toBe(false)
    expect(ops.inserted).toHaveLength(0)
  })

  it('approveRescheduleRequest carries snapshot, amount and training balls', async () => {
    const ops = setup([existingRow({ training_balls: true, is_manual: false })], {
      reschedule_requests: {
        id: 'r1', status: 'pending', booking_group_id: 'g1', new_date: '2026-12-05', new_time_slots: ['12:00'],
        original_date: DATE, original_time_slots: ['10:00'], customer_email: 'a@b.c', customer_name: 'Ann',
      },
    })
    const res = await approveRescheduleRequest('r1')
    expect(res.success).toBe(true)
    expect(ops.inserted[0].pricing_snapshot).toEqual(OLD_SNAPSHOT)
    expect(ops.inserted[0].payment_amount).toBe(123)
    expect(ops.inserted[0].training_balls).toBe(true)
  })
})

describe('cancelBookingGroup uses the booking snapshot', () => {
  // Play date 2026-12-01 10:00 Manila; "now" is set relative to it per test.
  const PLAY = new Date('2026-12-01T10:00:00+08:00').getTime()
  const hoursBefore = (h: number) => new Date(PLAY - h * 3600_000)
  const CUSTOM = { version_id: 'v9', rules: { ...SEED_PRICING_RULES, cancellation_fee_per_slot: 150, cancellation_window_hours: 48 } }

  function setupCancel(rows: Record<string, unknown>[]) {
    const updates: Record<string, unknown>[] = []
    from.mockImplementation(() => {
      const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
      let isUpdate = false
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = vi.fn(() => q)
      q.update = vi.fn((v: Record<string, unknown>) => { isUpdate = true; updates.push(v); return q })
      q.single = vi.fn(() => Promise.resolve({ data: null, error: null }))
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(isUpdate ? { error: null } : { data: rows, error: null }).then(res, rej)
      return q
    })
    return updates
  }
  const rows = (snap: unknown) => [existingRow({ user_id: 'u1', pricing_snapshot: snap, payment_amount: 450, time_slot: '10:00' })]

  beforeEach(() => { from.mockReset(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('applies the snapshot fee inside its window (30h out, 48h window)', async () => {
    vi.setSystemTime(hoursBefore(30))
    const updates = setupCancel(rows(CUSTOM))
    const res = await cancelBookingGroup('g1', null, 'u1')
    expect(res.success).toBe(true)
    expect(updates[0]).toMatchObject({ cancellation_fee: 150, refund_amount: 300 })
  })

  it('is free when strictly beyond the snapshot window', async () => {
    vi.setSystemTime(hoursBefore(49))
    const updates = setupCancel(rows(CUSTOM))
    await cancelBookingGroup('g1', null, 'u1')
    expect(updates[0]).toMatchObject({ cancellation_fee: 0, refund_amount: 450 })
  })

  it('charges the fee at exactly the window boundary', async () => {
    vi.setSystemTime(hoursBefore(48))
    const updates = setupCancel(rows(CUSTOM))
    await cancelBookingGroup('g1', null, 'u1')
    expect(updates[0]).toMatchObject({ cancellation_fee: 150 })
  })

  it('uses the seed rules (100 / 24h) when there is no snapshot', async () => {
    vi.setSystemTime(hoursBefore(10))
    const updates = setupCancel(rows(null))
    await cancelBookingGroup('g1', null, 'u1')
    expect(updates[0]).toMatchObject({ cancellation_fee: 100, refund_amount: 350 })
  })

  it('fails closed on a malformed snapshot and cancels nothing', async () => {
    vi.setSystemTime(hoursBefore(10))
    const updates = setupCancel(rows({ version_id: 'x', rules: { nope: 1 } }))
    const res = await cancelBookingGroup('g1', null, 'u1')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/pricing/i)
    expect(updates).toHaveLength(0)
  })
})
