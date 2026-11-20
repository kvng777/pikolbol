import { describe, it, expect } from 'vitest'
import {
  isoWeekday,
  ruleAppliesOnDate,
  findBlockingRule,
  isRuleHidden,
  ruleLabel,
  ruleStatus,
  describeWeekdays,
  describeTimeSlots,
  describeRule,
  DEFAULT_RULE_LABEL,
  isSameSlotSelection,
  RULE_OVERLAP_LIMIT,
} from './slotRules'
import { permanentlyHiddenSlots, describeOpeningHours } from './slotRules'
import type { SlotRuleLike } from '@/types/slotRules'

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const openPlay: SlotRuleLike = {
  label: 'Open Play',
  start_date: '2026-11-20',
  end_date: null,
  weekdays: ALL_DAYS,
  time_slots: ['07:00-08:00', '08:00-09:00'],
}

describe('isoWeekday', () => {
  it('maps dates to ISO weekdays (Mon = 1, Sun = 7)', () => {
    expect(isoWeekday('2026-11-20')).toBe(5) // Friday
    expect(isoWeekday('2026-11-22')).toBe(7) // Sunday
    expect(isoWeekday('2026-11-23')).toBe(1) // Monday
  })
})

describe('ruleAppliesOnDate', () => {
  it('starts on start_date', () => {
    expect(ruleAppliesOnDate(openPlay, '2026-11-19')).toBe(false)
    expect(ruleAppliesOnDate(openPlay, '2026-11-20')).toBe(true)
  })
  it('has no end when end_date is null', () => {
    expect(ruleAppliesOnDate(openPlay, '2030-01-01')).toBe(true)
  })
  it('treats end_date as inclusive', () => {
    const r = { ...openPlay, end_date: '2026-12-07' }
    expect(ruleAppliesOnDate(r, '2026-12-07')).toBe(true)
    expect(ruleAppliesOnDate(r, '2026-12-08')).toBe(false)
  })
  it('only applies on its weekdays', () => {
    const mondays = { ...openPlay, weekdays: [1] }
    expect(ruleAppliesOnDate(mondays, '2026-11-23')).toBe(true)
    expect(ruleAppliesOnDate(mondays, '2026-11-24')).toBe(false)
  })
})

describe('findBlockingRule', () => {
  it('returns the first rule covering the slot on that date', () => {
    const other = { ...openPlay, label: 'Other' }
    expect(findBlockingRule([openPlay, other], '2026-11-21', '07:00-08:00')).toBe(openPlay)
  })
  it('returns null for an uncovered slot or date', () => {
    expect(findBlockingRule([openPlay], '2026-11-21', '09:00-10:00')).toBeNull()
    expect(findBlockingRule([openPlay], '2026-11-19', '07:00-08:00')).toBeNull()
  })
})

describe('ruleLabel', () => {
  it('defaults to Blocked when there is no label', () => {
    expect(ruleLabel({ label: null })).toBe(DEFAULT_RULE_LABEL)
    expect(ruleLabel({ label: '   ' })).toBe('Blocked')
    expect(ruleLabel({ label: 'Open Play' })).toBe('Open Play')
  })
})

describe('ruleStatus', () => {
  it('is upcoming, active or ended relative to today', () => {
    expect(ruleStatus(openPlay, '2026-11-19')).toBe('upcoming')
    expect(ruleStatus(openPlay, '2026-11-20')).toBe('active')
    expect(ruleStatus({ ...openPlay, end_date: '2026-11-25' }, '2026-11-25')).toBe('active')
    expect(ruleStatus({ ...openPlay, end_date: '2026-11-25' }, '2026-11-26')).toBe('ended')
  })
})

describe('wording', () => {
  it('describes weekdays', () => {
    expect(describeWeekdays(ALL_DAYS)).toBe('every day')
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('weekdays')
    expect(describeWeekdays([7, 6])).toBe('weekends')
    expect(describeWeekdays([3, 1])).toBe('Mon, Wed')
  })
  it('merges consecutive slots into ranges', () => {
    expect(describeTimeSlots(['08:00-09:00', '07:00-08:00', '10:00-11:00'])).toBe('7 AM - 9 AM, 10 AM - 11 AM')
    expect(describeTimeSlots(['23:00-00:00'])).toBe('11 PM - 12 AM')
  })
  it('summarises a rule', () => {
    expect(describeRule(openPlay)).toBe('Open Play: 7 AM - 9 AM, every day, from Nov 20, 2026')
    expect(describeRule({ ...openPlay, label: null, end_date: '2026-12-07', weekdays: [6, 7] })).toBe(
      'Blocked: 7 AM - 9 AM, weekends, Nov 20, 2026 – Dec 7, 2026'
    )
  })
})

describe('isSameSlotSelection', () => {
  const a = '07:00-08:00'
  const b = '08:00-09:00'
  it('matches same date and slots in any order', () => {
    expect(isSameSlotSelection('2026-11-20', [a, b], '2026-11-20', [b, a])).toBe(true)
  })
  it('differs on date, length, membership or duplicates', () => {
    expect(isSameSlotSelection('2026-11-20', [a], '2026-11-21', [a])).toBe(false)
    expect(isSameSlotSelection('2026-11-20', [a], '2026-11-20', [a, b])).toBe(false)
    expect(isSameSlotSelection('2026-11-20', [a, b], '2026-11-20', [a])).toBe(false)
    expect(isSameSlotSelection('2026-11-20', [a, b], '2026-11-20', [a, '09:00-10:00'])).toBe(false)
    expect(isSameSlotSelection('2026-11-20', [a, b], '2026-11-20', [a, a])).toBe(false)
  })
  it('treats two empty selections on one date as the same', () => {
    expect(isSameSlotSelection('2026-11-20', [], '2026-11-20', [])).toBe(true)
  })
  it('exports the overlap cap', () => {
    expect(RULE_OVERLAP_LIMIT).toBeGreaterThan(0)
  })
})

describe('isRuleHidden', () => {
  it('is true only for an explicit true (missing or false → visible)', () => {
    expect(isRuleHidden({ hide_from_customers: true })).toBe(true)
    expect(isRuleHidden({ hide_from_customers: false })).toBe(false)
    expect(isRuleHidden({})).toBe(false)
  })
})

describe('permanentlyHiddenSlots', () => {
  const all = [1, 2, 3, 4, 5, 6, 7]
  const rule = (o: Partial<SlotRuleLike>): SlotRuleLike => ({
    label: null, start_date: '2026-01-01', end_date: null, weekdays: all, time_slots: ['05:00-06:00'], hide_from_customers: true, ...o,
  })
  const T = '2026-11-20'
  it('collects hours of an every-day, open-ended, hidden rule already started', () => {
    expect([...permanentlyHiddenSlots([rule({ time_slots: ['05:00-06:00', '23:00-00:00'] })], T)].sort((a, b) => a - b)).toEqual([5, 23])
  })
  it('accepts a rule starting today', () => {
    expect(permanentlyHiddenSlots([rule({ start_date: T })], T).has(5)).toBe(true)
  })
  it('ignores rules that are not permanent or not hidden', () => {
    expect(permanentlyHiddenSlots([rule({ hide_from_customers: false })], T).size).toBe(0)
    expect(permanentlyHiddenSlots([rule({ hide_from_customers: undefined })], T).size).toBe(0)
    expect(permanentlyHiddenSlots([rule({ weekdays: [1, 2, 3, 4, 5, 6] })], T).size).toBe(0)
    expect(permanentlyHiddenSlots([rule({ end_date: '2026-12-31' })], T).size).toBe(0)
    expect(permanentlyHiddenSlots([rule({ start_date: '2026-11-21' })], T).size).toBe(0)
  })
  it('returns an empty set for no rules', () => {
    expect(permanentlyHiddenSlots([], T).size).toBe(0)
  })
})

describe('describeOpeningHours', () => {
  it('shows the full window when nothing is hidden', () => {
    expect(describeOpeningHours(new Set())).toBe('Open daily: 5:00 AM — 12:00 AM (midnight)')
  })
  it('starts later when early hours are hidden', () => {
    expect(describeOpeningHours(new Set([5]))).toBe('Open daily: 6:00 AM — 12:00 AM (midnight)')
  })
  it('ends earlier when late hours are hidden', () => {
    expect(describeOpeningHours(new Set([22, 23]))).toBe('Open daily: 5:00 AM — 10:00 PM')
  })
  it('lists a midday gap as closed', () => {
    expect(describeOpeningHours(new Set([5, 12]))).toBe('Open daily: 6:00 AM — 12:00 AM (midnight) (closed 12 PM - 1 PM)')
  })
  it('says Closed when every hour is hidden', () => {
    expect(describeOpeningHours(new Set(Array.from({ length: 19 }, (_, i) => i + 5)))).toBe('Closed')
  })
})
