import { describe, it, expect } from 'vitest'
import { slotRuleInputSchema } from './slotRulesSchema'

const valid = {
  label: 'Open Play',
  startDate: '2026-11-20',
  endDate: null,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  timeSlots: ['07:00-08:00', '08:00-09:00'],
}

describe('slotRuleInputSchema', () => {
  it('accepts a valid rule', () => {
    expect(slotRuleInputSchema.safeParse(valid).success).toBe(true)
  })
  it('turns an empty or blank label into null and trims labels', () => {
    expect(slotRuleInputSchema.parse({ ...valid, label: '' }).label).toBeNull()
    expect(slotRuleInputSchema.parse({ ...valid, label: '   ' }).label).toBeNull()
    expect(slotRuleInputSchema.parse({ ...valid, label: null }).label).toBeNull()
    expect(slotRuleInputSchema.parse({ ...valid, label: ' Tournament ' }).label).toBe('Tournament')
  })
  it('rejects a label over 30 characters', () => {
    expect(slotRuleInputSchema.safeParse({ ...valid, label: 'x'.repeat(31) }).success).toBe(false)
  })
  it('rejects invalid dates and an end before the start', () => {
    expect(slotRuleInputSchema.safeParse({ ...valid, startDate: '2026-02-30' }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, endDate: '2026-11-19' }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, endDate: '2026-11-20' }).success).toBe(true)
  })
  it('requires unique weekdays 1–7', () => {
    expect(slotRuleInputSchema.safeParse({ ...valid, weekdays: [] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, weekdays: [0] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, weekdays: [8] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, weekdays: [1, 1] }).success).toBe(false)
  })
  it('requires unique real time slots', () => {
    expect(slotRuleInputSchema.safeParse({ ...valid, timeSlots: [] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, timeSlots: ['02:00-03:00'] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, timeSlots: ['07:00 - 08:00'] }).success).toBe(false)
    expect(slotRuleInputSchema.safeParse({ ...valid, timeSlots: ['07:00-08:00', '07:00-08:00'] }).success).toBe(false)
  })
  it('rejects unknown fields', () => {
    expect(slotRuleInputSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
