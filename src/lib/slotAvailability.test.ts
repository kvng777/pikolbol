import { describe, it, expect, vi, beforeEach } from 'vitest'

const { from, getSlotRulesForDate } = vi.hoisted(() => ({ from: vi.fn(), getSlotRulesForDate: vi.fn() }))
vi.mock('./supabase-server', () => ({ supabase: { from } }))
vi.mock('./slotRulesService', async (orig) => ({
  ...(await orig<typeof import('./slotRulesService')>()),
  getSlotRulesForDate,
}))

import { findBlockedSlots, blocksForAdmin, describeBlocked } from './slotAvailability'
import { AvailabilityUnavailableError } from './slotRulesService'

function tables(byTable: Record<string, { data: unknown; error: unknown }>) {
  from.mockImplementation((table: string) => {
    const q: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const m of ['select', 'eq', 'lte', 'gte', 'limit']) q[m] = vi.fn(() => q)
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
    tables({})
    for (const d of ['garbage', '2026-02-30', '2026-2-3', '']) {
      await expect(findBlockedSlots(d, ['09:00-10:00'])).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    }
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
  it('describes blocks for messages', () => {
    expect(describeBlocked(blocked.slice(0, 1))).toBe('07:00-08:00 (Open Play)')
  })
})
