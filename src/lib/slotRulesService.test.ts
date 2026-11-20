import { describe, it, expect, vi, beforeEach } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase-server', () => ({ supabase: { from } }))

import {
  getSlotRulesForDate,
  listSlotRules,
  listCurrentSlotRules,
  createSlotRule,
  updateSlotRule,
  endSlotRule,
  deleteSlotRule,
  findBookingsOverlappingRule,
  AvailabilityUnavailableError,
} from './slotRulesService'

type Result = { data?: unknown; error?: unknown }

/** Chainable query stub; records calls; resolves to `result` (or per-call results in order). */
function stub(...results: Result[]) {
  const calls: { method: string; args: unknown[] }[] = []
  let n = 0
  from.mockImplementation(() => {
    const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'lte', 'gte', 'or', 'order', 'limit']) {
      q[m] = vi.fn((...args: unknown[]) => { calls.push({ method: m, args }); return q })
    }
    const next = () => Promise.resolve(results[Math.min(n++, results.length - 1)] ?? { data: null, error: null })
    q.single = vi.fn(next)
    q.maybeSingle = vi.fn(next)
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => next().then(res, rej)
    return q
  })
  return calls
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', label: 'Open Play', start_date: '2026-11-20', end_date: null, weekdays: [1, 2, 3, 4, 5, 6, 7],
  time_slots: ['07:00-08:00'], hide_from_customers: false, created_by: 'a1', created_at: 'x', updated_at: 'x', ...over,
})
const input = {
  label: 'Open Play', startDate: '2026-11-20', endDate: null, weekdays: [1, 2, 3, 4, 5, 6, 7], timeSlots: ['07:00-08:00'],
  hideFromCustomers: false,
}
const NOW = new Date('2026-11-21T04:00:00Z') // Manila 2026-11-21 12:00

describe('slotRulesService', () => {
  beforeEach(() => from.mockReset())

  it('getSlotRulesForDate filters by range in SQL and by weekday in code', async () => {
    const calls = stub({ data: [row(), row({ id: 'r2', weekdays: [1] })], error: null })
    const rules = await getSlotRulesForDate('2026-11-21') // Saturday
    expect(rules.map((r) => r.id)).toEqual(['r1'])
    expect(calls).toContainEqual({ method: 'lte', args: ['start_date', '2026-11-21'] })
    expect(calls).toContainEqual({ method: 'or', args: ['end_date.is.null,end_date.gte.2026-11-21'] })
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: true }] })
    expect(calls).toContainEqual({ method: 'order', args: ['id', { ascending: true }] })
  })

  it('fails closed when rules cannot be read', async () => {
    stub({ data: null, error: { message: 'down' } })
    await expect(getSlotRulesForDate('2026-11-21')).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    await expect(listSlotRules()).rejects.toBeInstanceOf(AvailabilityUnavailableError)
  })

  it('getSlotRulesForDate fails closed on an invalid date without querying', async () => {
    stub({ data: [], error: null })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const d of ['garbage', '2026-02-30', '2026-12-1', '']) {
      await expect(getSlotRulesForDate(d)).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    }
    expect(from).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('listSlotRules orders newest first with deterministic tiebreakers', async () => {
    const calls = stub({ data: [], error: null })
    await listSlotRules()
    const orders = calls.filter((c) => c.method === 'order')
    expect(orders.map((c) => c.args)).toEqual([
      ['start_date', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id'],
    ])
  })

  it('listCurrentSlotRules selects public columns without created_by', async () => {
    const calls = stub({ data: [], error: null })
    await listCurrentSlotRules('2026-11-21')
    const select = calls.find((c) => c.method === 'select')!
    expect(select.args[0]).toBe('id, label, start_date, end_date, weekdays, time_slots, hide_from_customers, created_at, updated_at')
  })

  it('admin reads select every column including hide_from_customers', async () => {
    const calls = stub({ data: [], error: null })
    await listSlotRules()
    expect(calls.find((c) => c.method === 'select')!.args[0]).toBe(
      'id, label, start_date, end_date, weekdays, time_slots, hide_from_customers, created_by, created_at, updated_at'
    )
  })

  it('createSlotRule validates, sorts and records the creator', async () => {
    const calls = stub({ data: row(), error: null })
    const res = await createSlotRule({ ...input, weekdays: [3, 1], timeSlots: ['08:00-09:00', '07:00-08:00'] }, 'a1')
    expect(res.success).toBe(true)
    const insert = calls.find((c) => c.method === 'insert')!
    expect(insert.args[0]).toEqual({
      label: 'Open Play', start_date: '2026-11-20', end_date: null, weekdays: [1, 3],
      time_slots: ['07:00-08:00', '08:00-09:00'], hide_from_customers: false, created_by: 'a1',
    })
  })

  it('createSlotRule saves hide_from_customers', async () => {
    const calls = stub({ data: row({ hide_from_customers: true }), error: null })
    await createSlotRule({ ...input, hideFromCustomers: true }, 'a1')
    expect((calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>).hide_from_customers).toBe(true)
  })

  it('updateSlotRule maps hide_from_customers (absent → false)', async () => {
    let calls = stub({ data: row(), error: null })
    await updateSlotRule('r1', { ...input, hideFromCustomers: true })
    expect((calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>).hide_from_customers).toBe(true)
    calls = stub({ data: row(), error: null })
    const { hideFromCustomers: _omit, ...withoutFlag } = input // eslint-disable-line @typescript-eslint/no-unused-vars
    await updateSlotRule('r1', withoutFlag)
    expect((calls.find((c) => c.method === 'update')!.args[0] as Record<string, unknown>).hide_from_customers).toBe(false)
  })

  it('createSlotRule rejects invalid input without touching the DB', async () => {
    stub({ data: row(), error: null })
    const res = await createSlotRule({ ...input, weekdays: [] }, 'a1')
    expect(res).toEqual({ success: false, error: 'Pick at least one day' })
    expect(from).not.toHaveBeenCalled()
  })

  it('updateSlotRule reports a missing rule', async () => {
    stub({ data: null, error: null })
    expect(await updateSlotRule('nope', input)).toEqual({ success: false, error: 'Rule not found' })
  })

  it('endSlotRule sets end_date to Manila yesterday for a rule that already started', async () => {
    const calls = stub({ data: { start_date: '2026-11-01', end_date: null }, error: null }, { data: [{ id: 'r1' }], error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: true, deleted: false })
    const update = calls.find((c) => c.method === 'update')!
    expect((update.args[0] as Record<string, unknown>).end_date).toBe('2026-11-20')
  })

  it('endSlotRule deletes a rule that has not started before today', async () => {
    const calls = stub({ data: { start_date: '2026-11-21', end_date: null }, error: null }, { data: [{ id: 'r1' }], error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: true, deleted: true })
    expect(calls.some((c) => c.method === 'delete')).toBe(true)
  })

  it('endSlotRule logs and reports update and delete errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub({ data: { start_date: '2026-11-01', end_date: null }, error: null }, { data: null, error: { message: 'x' } })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: false, error: 'Failed to end the rule' })
    stub({ data: { start_date: '2026-11-21', end_date: null }, error: null }, { data: null, error: { message: 'x' } })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: false, error: 'Failed to end the rule' })
    expect(err).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })

  it('endSlotRule reports Rule not found when nothing was updated or deleted', async () => {
    stub({ data: { start_date: '2026-11-01', end_date: null }, error: null }, { data: [], error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: false, error: 'Rule not found' })
    stub({ data: { start_date: '2026-11-21', end_date: null }, error: null }, { data: [], error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: false, error: 'Rule not found' })
  })

  it('endSlotRule refuses an already-ended rule', async () => {
    stub({ data: { start_date: '2026-11-01', end_date: '2026-11-10' }, error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: false, error: 'This rule has already ended.' })
  })

  it('deleteSlotRule deletes by id', async () => {
    const calls = stub({ data: null, error: null })
    expect(await deleteSlotRule('r1')).toEqual({ success: true })
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'r1'] })
  })

  it('findBookingsOverlappingRule returns active bookings on the rule weekdays from today', async () => {
    const calls = stub({
      data: [
        { short_id: 'A1', date: '2026-11-23', time_slot: '07:00-08:00', name: 'Ann', payment_status: 'confirmed' }, // Mon
        { short_id: 'B2', date: '2026-11-24', time_slot: '07:00-08:00', name: 'Ben', payment_status: 'pending' },   // Tue
      ],
      error: null,
    })
    const res = await findBookingsOverlappingRule({ ...input, startDate: '2026-11-01', weekdays: [1] }, NOW)
    expect(res).toEqual({
      bookings: [{ shortId: 'A1', date: '2026-11-23', timeSlot: '07:00-08:00', name: 'Ann', status: 'confirmed' }],
      truncated: false,
    })
    expect(calls).toContainEqual({ method: 'gte', args: ['date', '2026-11-21'] }) // clamped to today
    expect(calls).toContainEqual({ method: 'in', args: ['payment_status', ['pending', 'confirmed']] })
    expect(calls).toContainEqual({ method: 'in', args: ['time_slot', ['07:00-08:00']] })
    expect(calls).toContainEqual({ method: 'lte', args: ['date', '2027-11-22'] }) // open-ended: today + 366
    expect(calls).toContainEqual({ method: 'limit', args: [1000] })
  })

  it('findBookingsOverlappingRule flags truncation when the cap is hit', async () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      short_id: `S${i}`, date: '2026-11-23', time_slot: '07:00-08:00', name: 'X', payment_status: 'confirmed',
    }))
    stub({ data, error: null })
    const res = await findBookingsOverlappingRule({ ...input, weekdays: [1] }, NOW)
    expect(res.truncated).toBe(true)
    expect(res.bookings).toHaveLength(1000)
  })

  it('findBookingsOverlappingRule returns nothing without querying when the rule already ended', async () => {
    stub({ data: [], error: null })
    const res = await findBookingsOverlappingRule({ ...input, startDate: '2026-10-01', endDate: '2026-11-10' }, NOW)
    expect(res).toEqual({ bookings: [], truncated: false })
    expect(from).not.toHaveBeenCalled()
  })
})
