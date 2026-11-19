import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateEquipmentBreakdown } from './financeUtils'
import { SEED_PRICING_RULES } from './pricing'
import type { Booking } from '@/types/booking'

function booking(over: Partial<Booking>): Booking {
  return {
    id: 'b', name: 'N', phone: '', email: '', date: '2026-12-01', time_slot: '08:00-09:00',
    court_number: 1, created_at: '2026-11-01T00:00:00Z', players: 2, payment_status: 'confirmed',
    booking_group_id: 'g', paddles_count: 0, needs_balls: false, training_balls: false, ...over,
  } as Booking
}

afterEach(() => vi.restoreAllMocks())

describe('calculateEquipmentBreakdown', () => {
  it('uses the prices saved on each booking', () => {
    const rules = { ...SEED_PRICING_RULES, paddle_price: 80, ball_set_price: 40 }
    const result = calculateEquipmentBreakdown([
      booking({ booking_group_id: 'g1', paddles_count: 2, needs_balls: true, pricing_snapshot: { version_id: 'v2', rules } }),
    ])
    expect(result.paddleRevenue).toBe(160)
    expect(result.ballSetRevenue).toBe(40)
  })

  it('uses seed prices for legacy rows without a snapshot', () => {
    const result = calculateEquipmentBreakdown([booking({ paddles_count: 2, training_balls: true })])
    expect(result.paddleRevenue).toBe(100)
    expect(result.trainingBallsRevenue).toBe(100)
  })

  it("counts nothing for play dates before the snapshot's charge start date", () => {
    const result = calculateEquipmentBreakdown([booking({ date: '2026-05-15', paddles_count: 2 })])
    expect(result.paddlesRented).toBe(2)
    expect(result.totalEquipmentRevenue).toBe(0)
  })

  it('always charges when the snapshot start date is null', () => {
    const rules = { ...SEED_PRICING_RULES, equipment_charge_start_date: null }
    const result = calculateEquipmentBreakdown([
      booking({ date: '2026-05-15', paddles_count: 2, pricing_snapshot: { version_id: 'v3', rules } }),
    ])
    expect(result.totalEquipmentRevenue).toBe(100)
  })

  it("uses the snapshot's own start date, not the seed's", () => {
    const rules = { ...SEED_PRICING_RULES, equipment_charge_start_date: '2026-12-15' }
    const result = calculateEquipmentBreakdown([
      booking({ id: 'a', booking_group_id: 'g1', date: '2026-12-01', paddles_count: 2, pricing_snapshot: { version_id: 'v4', rules } }),
      booking({ id: 'b', booking_group_id: 'g2', date: '2026-12-20', paddles_count: 1, pricing_snapshot: { version_id: 'v4', rules } }),
    ])
    // Dec 1 is free under this snapshot (the seed would charge it); Dec 20 is charged.
    expect(result.paddleRevenue).toBe(50)
  })

  it('counts a multi-slot order once', () => {
    const result = calculateEquipmentBreakdown([
      booking({ id: 'a', time_slot: '08:00-09:00', paddles_count: 1 }),
      booking({ id: 'b', time_slot: '09:00-10:00', paddles_count: 1 }),
    ])
    expect(result.paddleRevenue).toBe(50)
  })

  it('counts a malformed snapshot as 0 revenue without breaking other groups', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = { version_id: 'x', rules: { nope: true } } as unknown as Booking['pricing_snapshot']
    const result = calculateEquipmentBreakdown([
      booking({ id: 'a', booking_group_id: 'g1', paddles_count: 2, pricing_snapshot: bad }),
      booking({ id: 'b', booking_group_id: 'g2', paddles_count: 1 }),
    ])
    expect(result.paddlesRented).toBe(3)
    expect(result.paddleRevenue).toBe(50)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
