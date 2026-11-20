import { describe, it, expect } from 'vitest'
import { getAvailableSlotsForCourt } from './timeSlotGenerator'

const DATE = '2030-01-07' // a future Monday, so no "past" slots
const rule = { label: 'Open Play', start_date: '2030-01-01', end_date: null, weekdays: [1], time_slots: ['07:00-08:00'] }

describe('getAvailableSlotsForCourt with rules', () => {
  it('marks rule-blocked slots with the rule label', () => {
    const slots = getAvailableSlotsForCourt([], DATE, 1, [], { rules: [rule] })
    expect(slots.find((s) => s.time === '07:00-08:00')).toEqual({ time: '07:00-08:00', available: false, reason: 'rule', label: 'Open Play' })
    expect(slots.find((s) => s.time === '08:00-09:00')).toEqual({ time: '08:00-09:00', available: true, reason: undefined, label: undefined })
  })

  it('uses "Blocked" when the rule has no label', () => {
    const slots = getAvailableSlotsForCourt([], DATE, 1, [], { rules: [{ ...rule, label: null }] })
    expect(slots.find((s) => s.time === '07:00-08:00')?.label).toBe('Blocked')
  })

  it('booked and one-day blocks win over rules', () => {
    const booked = [{ date: DATE, time_slot: '07:00-08:00', court_number: 1 }]
    expect(getAvailableSlotsForCourt(booked, DATE, 1, [], { rules: [rule] }).find((s) => s.time === '07:00-08:00')?.reason).toBe('booked')
    const disabled = [{ id: 'd', date: DATE, time_slot: '07:00-08:00', created_at: '' }]
    expect(getAvailableSlotsForCourt([], DATE, 1, disabled, { rules: [rule] }).find((s) => s.time === '07:00-08:00')?.reason).toBe('disabled')
  })

  it('does not block on other weekdays', () => {
    const slots = getAvailableSlotsForCourt([], '2030-01-08', 1, [], { rules: [rule] })
    expect(slots.every((s) => s.available)).toBe(true)
  })

  it('keeps legacy calls working', () => {
    expect(getAvailableSlotsForCourt([], DATE, 1, [], true).every((s) => s.available)).toBe(true)
  })
})
