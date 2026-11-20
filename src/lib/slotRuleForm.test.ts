import { describe, it, expect } from 'vitest'
import {
  RULE_SLOTS,
  canEndRule,
  deleteRuleDescription,
  reactivatesRule,
  applySlotDrag,
  endRuleDescription,
  formValuesToInput,
  initialSlotRuleFormValues,
  overlapSummary,
  ruleStatusText,
  slotLabel,
  sortRulesForList,
  sortSlots,
  toggleSlot,
  toggleWeekday,
  validateSlotRuleForm,
  type SlotRuleFormValues,
} from './slotRuleForm'
import type { SlotRuleLike } from '@/types/slotRules'

const TODAY = '2026-11-20'

function form(over: Partial<SlotRuleFormValues> = {}): SlotRuleFormValues {
  return { ...initialSlotRuleFormValues(null, TODAY), timeSlots: ['07:00-08:00'], ...over }
}

const rule = (over: Partial<SlotRuleLike> = {}): SlotRuleLike => ({
  label: 'Open Play',
  start_date: '2026-11-01',
  end_date: null,
  weekdays: [1, 3],
  time_slots: ['08:00-09:00', '07:00-08:00'],
  ...over,
})

describe('initialSlotRuleFormValues', () => {
  it('defaults a new rule to every day from today, no end, no slots', () => {
    expect(initialSlotRuleFormValues(null, TODAY)).toEqual({
      label: '',
      startDate: TODAY,
      noEnd: true,
      endDate: '',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timeSlots: [],
    })
  })

  it('prefills from a rule (sorted slots, null label → empty)', () => {
    expect(initialSlotRuleFormValues(rule({ label: null, end_date: '2026-12-31' }), TODAY)).toEqual({
      label: '',
      startDate: '2026-11-01',
      noEnd: false,
      endDate: '2026-12-31',
      weekdays: [1, 3],
      timeSlots: ['07:00-08:00', '08:00-09:00'],
    })
  })

  it('round-trips through formValuesToInput', () => {
    const values = initialSlotRuleFormValues(rule({ end_date: '2026-12-31' }), TODAY)
    expect(formValuesToInput(values)).toEqual({
      label: 'Open Play',
      startDate: '2026-11-01',
      endDate: '2026-12-31',
      weekdays: [1, 3],
      timeSlots: ['07:00-08:00', '08:00-09:00'],
    })
  })
})

describe('formValuesToInput', () => {
  it('trims the label and sends null when empty', () => {
    expect(formValuesToInput(form({ label: '  Open Play ' })).label).toBe('Open Play')
    expect(formValuesToInput(form({ label: '   ' })).label).toBeNull()
  })

  it('ignores the end date when "No end date" is on', () => {
    expect(formValuesToInput(form({ noEnd: true, endDate: '2026-12-01' })).endDate).toBeNull()
    expect(formValuesToInput(form({ noEnd: false, endDate: '2026-12-01' })).endDate).toBe('2026-12-01')
  })

  it('dedupes and sorts weekdays and slots', () => {
    const input = formValuesToInput(form({ weekdays: [7, 1, 1], timeSlots: ['23:00-00:00', '05:00-06:00', '05:00-06:00'] }))
    expect(input.weekdays).toEqual([1, 7])
    expect(input.timeSlots).toEqual(['05:00-06:00', '23:00-00:00'])
  })
})

describe('validateSlotRuleForm', () => {
  it('accepts a valid form', () => {
    const result = validateSlotRuleForm(form({ label: 'Open Play' }))
    expect(result).toEqual({
      ok: true,
      input: { label: 'Open Play', startDate: TODAY, endDate: null, weekdays: [1, 2, 3, 4, 5, 6, 7], timeSlots: ['07:00-08:00'] },
    })
  })

  it('reports missing days and slots per field', () => {
    const result = validateSlotRuleForm(form({ weekdays: [], timeSlots: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.weekdays).toBe('Pick at least one day')
    expect(result.errors.timeSlots).toBe('Pick at least one time slot')
  })

  it('asks for an end date when "No end date" is off', () => {
    const result = validateSlotRuleForm(form({ noEnd: false, endDate: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.endDate).toBe('Pick an end date, or choose "No end date"')
  })

  it('rejects an end date before the start date', () => {
    const result = validateSlotRuleForm(form({ noEnd: false, endDate: '2026-11-19' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.endDate).toBe('End date must be on or after the start date')
  })

  it('accepts a one-day rule (end = start)', () => {
    expect(validateSlotRuleForm(form({ noEnd: false, endDate: TODAY })).ok).toBe(true)
  })

  it('asks for a start date and rejects impossible dates', () => {
    const empty = validateSlotRuleForm(form({ startDate: '' }))
    expect(!empty.ok && empty.errors.startDate).toBe('Pick a start date')
    const bad = validateSlotRuleForm(form({ startDate: '2026-02-30' }))
    expect(!bad.ok && bad.errors.startDate).toBe('Enter a valid date')
  })

  it('rejects labels over 30 characters (after trimming)', () => {
    expect(validateSlotRuleForm(form({ label: `  ${'a'.repeat(30)}  ` })).ok).toBe(true)
    const result = validateSlotRuleForm(form({ label: 'a'.repeat(31) }))
    expect(!result.ok && result.errors.label).toBe('Label must be 30 characters or fewer')
  })
})

describe('toggles', () => {
  it('toggles weekdays, keeping them sorted', () => {
    expect(toggleWeekday([1, 5], 3)).toEqual([1, 3, 5])
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5])
  })

  it('toggles slots, keeping grid order', () => {
    expect(toggleSlot(['09:00-10:00'], '05:00-06:00')).toEqual(['05:00-06:00', '09:00-10:00'])
    expect(toggleSlot(['05:00-06:00', '09:00-10:00'], '05:00-06:00')).toEqual(['09:00-10:00'])
  })

  it('sortSlots puts unknown slots last', () => {
    expect(sortSlots(['bogus', '06:00-07:00', '05:00-06:00'])).toEqual(['05:00-06:00', '06:00-07:00', 'bogus'])
  })
})

describe('applySlotDrag', () => {
  it('adds the whole range between anchor and current, in either direction', () => {
    expect(applySlotDrag([], '07:00-08:00', '09:00-10:00', true)).toEqual(['07:00-08:00', '08:00-09:00', '09:00-10:00'])
    expect(applySlotDrag([], '09:00-10:00', '07:00-08:00', true)).toEqual(['07:00-08:00', '08:00-09:00', '09:00-10:00'])
  })

  it('keeps slots selected before the drag, and shrinks when dragging back', () => {
    const base = ['20:00-21:00']
    expect(applySlotDrag(base, '07:00-08:00', '08:00-09:00', true)).toEqual(['07:00-08:00', '08:00-09:00', '20:00-21:00'])
    expect(applySlotDrag(base, '07:00-08:00', '07:00-08:00', true)).toEqual(['07:00-08:00', '20:00-21:00'])
  })

  it('removes the range when the drag started on a selected slot', () => {
    const base = ['07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00']
    expect(applySlotDrag(base, '08:00-09:00', '09:00-10:00', false)).toEqual(['07:00-08:00', '10:00-11:00'])
  })

  it('ignores unknown slots', () => {
    expect(applySlotDrag(['07:00-08:00'], 'x', '09:00-10:00', true)).toEqual(['07:00-08:00'])
  })

  it('covers the full grid', () => {
    expect(applySlotDrag([], RULE_SLOTS[0], RULE_SLOTS[RULE_SLOTS.length - 1], true)).toEqual([...RULE_SLOTS])
  })
})

describe('labels', () => {
  it('slotLabel uses 12-hour times', () => {
    expect(slotLabel('05:00-06:00')).toBe('5 AM - 6 AM')
    expect(slotLabel('11:00-12:00')).toBe('11 AM - 12 PM')
    expect(slotLabel('23:00-00:00')).toBe('11 PM - 12 AM')
  })

  it('ruleStatusText', () => {
    expect(ruleStatusText({ start_date: '2026-11-01', end_date: null }, TODAY)).toBe('Active')
    expect(ruleStatusText({ start_date: TODAY, end_date: TODAY }, TODAY)).toBe('Active')
    expect(ruleStatusText({ start_date: '2026-11-25', end_date: null }, TODAY)).toBe('Starts Nov 25, 2026')
    expect(ruleStatusText({ start_date: '2026-11-01', end_date: '2026-11-19' }, TODAY)).toBe('Ended')
  })

  it('endRuleDescription says a rule that has not started (or starts today) is removed', () => {
    expect(endRuleDescription({ start_date: '2026-11-25' }, TODAY)).toBe(
      "This rule hasn't started yet (it starts Nov 25, 2026), so ending it removes it completely."
    )
    expect(endRuleDescription({ start_date: TODAY }, TODAY)).toMatch(/starts today, so ending it removes it completely/)
    expect(endRuleDescription({ start_date: '2026-11-19' }, TODAY)).toMatch(/stays in the list as ended/)
  })

  it('overlapSummary', () => {
    expect(overlapSummary(0, false)).toBe('No existing bookings fall in these slots.')
    expect(overlapSummary(1, false)).toMatch(/^1 existing booking falls in these slots/)
    expect(overlapSummary(3, false)).toMatch(/^3 existing bookings fall/)
    expect(overlapSummary(1000, true)).toMatch(/^1,000 or more existing bookings fall/)
  })
})

describe('sortRulesForList', () => {
  it('moves ended rules last and keeps the rest in order', () => {
    const rules = [
      { id: 'a', start_date: '2026-10-01', end_date: '2026-10-31' },
      { id: 'b', start_date: '2026-12-01', end_date: null },
      { id: 'c', start_date: '2026-09-01', end_date: '2026-09-02' },
      { id: 'd', start_date: '2026-11-01', end_date: null },
    ]
    expect(sortRulesForList(rules, TODAY).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('No end date with a junk endDate', () => {
  it('passes validation and drops the end date', () => {
    const r = validateSlotRuleForm(form({ noEnd: true, endDate: 'garbage' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.input.endDate).toBeNull()
  })
})

describe('endRuleDescription boundary', () => {
  it('start = today removes the rule', () => {
    expect(endRuleDescription({ start_date: TODAY }, TODAY)).toMatch(/starts today/)
  })
  it('start = yesterday keeps it as ended', () => {
    expect(endRuleDescription({ start_date: '2026-11-19' }, TODAY)).toMatch(/stays in the list as ended/)
  })
  it('start = tomorrow says it has not started', () => {
    expect(endRuleDescription({ start_date: '2026-11-21' }, TODAY)).toMatch(/hasn't started yet/)
  })
})

describe('canEndRule', () => {
  it('only for active rules that started before today', () => {
    expect(canEndRule({ start_date: '2026-11-19', end_date: null }, TODAY)).toBe(true)
    expect(canEndRule({ start_date: TODAY, end_date: null }, TODAY)).toBe(false)
    expect(canEndRule({ start_date: '2026-11-21', end_date: null }, TODAY)).toBe(false)
    expect(canEndRule({ start_date: '2026-11-01', end_date: '2026-11-19' }, TODAY)).toBe(false)
  })
})

describe('deleteRuleDescription', () => {
  it('mentions slots opening only for active or upcoming rules', () => {
    expect(deleteRuleDescription({ start_date: '2026-11-01', end_date: null }, TODAY)).toMatch(/slots open up again/)
    expect(deleteRuleDescription({ start_date: '2026-11-25', end_date: null }, TODAY)).toMatch(/slots open up again/)
    const ended = deleteRuleDescription({ start_date: '2026-11-01', end_date: '2026-11-10' }, TODAY)
    expect(ended).toMatch(/removed from the list/)
    expect(ended).not.toMatch(/open up/)
  })
})

describe('reactivatesRule', () => {
  const ended = { start_date: '2026-11-01', end_date: '2026-11-10' }
  it('is true when an ended rule becomes active or upcoming', () => {
    expect(reactivatesRule(ended, { startDate: '2026-11-01', endDate: null }, TODAY)).toBe(true)
    expect(reactivatesRule(ended, { startDate: '2026-11-25', endDate: '2026-11-30' }, TODAY)).toBe(true)
  })
  it('is false when still ended, for create, or for a non-ended rule', () => {
    expect(reactivatesRule(ended, { startDate: '2026-11-01', endDate: '2026-11-12' }, TODAY)).toBe(false)
    expect(reactivatesRule(null, { startDate: TODAY, endDate: null }, TODAY)).toBe(false)
    expect(reactivatesRule({ start_date: '2026-11-01', end_date: null }, { startDate: TODAY, endDate: null }, TODAY)).toBe(false)
  })
})
