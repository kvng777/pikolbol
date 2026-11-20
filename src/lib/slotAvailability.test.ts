import { describe, it, expect, vi, beforeEach } from 'vitest'

const { from, getSlotRulesForDate } = vi.hoisted(() => ({ from: vi.fn(), getSlotRulesForDate: vi.fn() }))
vi.mock('./supabase-server', () => ({ supabase: { from } }))
vi.mock('./slotRulesService', async (orig) => ({
  ...(await orig<typeof import('./slotRulesService')>()),
  getSlotRulesForDate,
}))

import { findBlockedSlots, blocksForAdmin, describeBlocked } from './slotAvailability'
import { AvailabilityUnavailableError } from './slotRulesService'

let calls: { table: string; method: string; args: unknown[] }[] = []

function tables(byTable: Record<string, { data: unknown; error: unknown }>) {
  calls = []
  from.mockImplementation((table: string) => {
    const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const m of ['select', 'eq', 'lte', 'gte', 'limit']) q[m] = vi.fn((...args: unknown[]) => { calls.push({ table, method: m, args }); return q })
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(byTable[table] ?? { data: [], error: null }).then(res, rej)
    return q
  })
}

const rule = { label: 'Open Play', start_date: '2026-11-01', end_date: null, weekdays: [1, 2, 3, 4, 5, 6, 7], time_slots: ['07:00-08:00'] }

describe('findBlockedSlots', () => {
  beforeEach(() => { from.mockReset(); getSlotRulesForDate.mockReset(); getSlotRulesForDate.mockResolvedValue([]) })

  it('returns nothing when slots are free', async () => {
    tables({})
    expect(await findBlockedSlots('2026-11-21', ['09:00-10:00'])).toEqual([])
  })

  it('queries closed dates and one-day blocks for the requested date', async () => {
    tables({})
    await findBlockedSlots('2026-11-21', ['09:00-10:00'])
    expect(calls).toContainEqual({ table: 'closed_dates', method: 'lte', args: ['start_date', '2026-11-21'] })
    expect(calls).toContainEqual({ table: 'closed_dates', method: 'gte', args: ['end_date', '2026-11-21'] })
    expect(calls).toContainEqual({ table: 'disabled_slots', method: 'eq', args: ['date', '2026-11-21'] })
    expect(getSlotRulesForDate).toHaveBeenCalledWith('2026-11-21')
  })

  it('reports one-day blocks and rule blocks with labels', async () => {
    tables({ disabled_slots: { data: [{ time_slot: '08:00-09:00' }], error: null } })
    getSlotRulesForDate.mockResolvedValue([rule])
    expect(await findBlockedSlots('2026-11-21', ['07:00-08:00', '08:00-09:00', '09:00-10:00'])).toEqual([
      { slot: '07:00-08:00', source: 'rule', label: 'Open Play' },
      { slot: '08:00-09:00', source: 'disabled', label: 'Blocked' },
    ])
  })

  it('blocks every slot on a closed date', async () => {
    tables({ closed_dates: { data: [{ reason: 'Holiday' }], error: null } })
    expect(await findBlockedSlots('2026-12-25', ['09:00-10:00'])).toEqual([{ slot: '09:00-10:00', source: 'closed', label: 'Holiday' }])
  })

  it('fails closed when anything cannot be read', async () => {
    tables({ disabled_slots: { data: null, error: { message: 'down' } } })
    await expect(findBlockedSlots('2026-11-21', ['09:00-10:00'])).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    tables({})
    getSlotRulesForDate.mockRejectedValue(new AvailabilityUnavailableError())
    await expect(findBlockedSlots('2026-11-21', ['09:00-10:00'])).rejects.toBeInstanceOf(AvailabilityUnavailableError)
  })
})

describe('findBlockedSlots date validation', () => {
  it('fails closed on invalid or non-padded dates', async () => {
    from.mockReset(); getSlotRulesForDate.mockReset()
    tables({})
    for (const d of ['garbage', '2026-02-30', '2026-12-1', '2026-2-3', '']) {
      await expect(findBlockedSlots(d, ['09:00-10:00'])).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    }
    expect(from).not.toHaveBeenCalled()
    expect(getSlotRulesForDate).not.toHaveBeenCalled()
  })
})

describe('blocksForAdmin / describeBlocked', () => {
  const blocked = [
    { slot: '07:00-08:00', source: 'rule' as const, label: 'Open Play' },
    { slot: '08:00-09:00', source: 'disabled' as const, label: 'Blocked' },
    { slot: '09:00-10:00', source: 'closed' as const, label: 'Holiday' },
  ]
  it('lets an admin override rules and one-day blocks, never closed dates', () => {
    expect(blocksForAdmin(blocked, true)).toEqual([blocked[2]])
    expect(blocksForAdmin(blocked, false)).toEqual(blocked)
  })
  it('only a literal true overrides', () => {
    expect(blocksForAdmin(blocked, 'false')).toEqual(blocked)
    expect(blocksForAdmin(blocked, 'true')).toEqual(blocked)
    expect(blocksForAdmin(blocked, 1)).toEqual(blocked)
    expect(blocksForAdmin(blocked, undefined)).toEqual(blocked)
  })
  it('describes blocks for messages', () => {
    expect(describeBlocked(blocked.slice(0, 1))).toBe('07:00-08:00 (Open Play)')
  })
  it('shows just the slot for unlabeled blocks', () => {
    expect(describeBlocked([blocked[1]])).toBe('08:00-09:00')
  })
  it('mentions a closed date once', () => {
    const closed = ['09:00-10:00', '10:00-11:00', '11:00-12:00'].map((slot) => ({ slot, source: 'closed' as const, label: 'Holiday' }))
    expect(describeBlocked(closed)).toBe('the court is closed (Holiday)')
    expect(describeBlocked([{ slot: '09:00-10:00', source: 'closed', label: 'Closed' }])).toBe('the court is closed')
  })
})
