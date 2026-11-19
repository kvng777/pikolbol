import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import { createAdminBooking, updateAdminBooking, approveRescheduleRequest } from './bookingService'

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
