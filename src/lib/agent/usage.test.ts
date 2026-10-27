import { describe, it, expect, vi, afterEach } from 'vitest'

// Configurable fake for supabase.from('agent_usage').select().gte().lt().order().range().
const db = vi.hoisted(() => ({
  from: vi.fn(),
}))
vi.mock('@/lib/supabase-server', () => ({ supabase: { from: db.from } }))

import { turnCostUsd, manilaMonthWindow, summarizeBudget, readBudgetConfig, checkBudgetGate } from './usage'

function usageRows(result: { data: { cost_usd: number }[] | null; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    gte: () => chain,
    lt: () => chain,
    order: () => chain,
    range: () => Promise.resolve(result),
  }
  return chain
}

describe('turnCostUsd', () => {
  it('prices each token class at Sonnet 5.5 rates', () => {
    // 1M of each: 2.00 + 0.20 + 2.50 + 10.00
    expect(
      turnCostUsd({ noCacheInput: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 })
    ).toBeCloseTo(14.7, 6)
  })

  it('handles a typical small turn', () => {
    // 3,000 uncached in, 2,000 cache read, 0 write, 600 out → 0.006 + 0.0004 + 0 + 0.006
    expect(turnCostUsd({ noCacheInput: 3000, cacheRead: 2000, cacheWrite: 0, output: 600 })).toBeCloseTo(0.0124, 6)
  })
})

describe('manilaMonthWindow', () => {
  it('returns the Manila calendar month as UTC instants', () => {
    // 2026-10-31T17:00Z is already Nov 1, 01:00 in Manila
    expect(manilaMonthWindow(new Date('2026-10-31T17:00:00Z'))).toEqual({
      startUtc: '2026-10-31T16:00:00.000Z', // Nov 1 00:00 +08:00
      endUtc: '2026-11-30T16:00:00.000Z',   // Dec 1 00:00 +08:00
      resetsOn: '2026-12-01',
    })
  })

  it('rolls over the year in December', () => {
    expect(manilaMonthWindow(new Date('2026-12-15T00:00:00Z')).resetsOn).toBe('2027-01-01')
  })
})

describe('summarizeBudget', () => {
  const now = new Date('2026-10-27T04:00:00Z')

  it('computes used/remaining/percent in PHP', () => {
    expect(summarizeBudget({ spentUsd: 7.5, budgetPhp: 1000, usdToPhp: 58, now })).toEqual({
      usedPhp: 435,
      budgetPhp: 1000,
      remainingPhp: 565,
      percent: 43.5,
      level: 'ok',
      exceeded: false,
      resetsOn: '2026-11-01',
    })
  })

  it('warns at 80% and blocks at 100%', () => {
    expect(summarizeBudget({ spentUsd: 14, budgetPhp: 1000, usdToPhp: 58, now }).level).toBe('warning') // ₱812
    const over = summarizeBudget({ spentUsd: 20, budgetPhp: 1000, usdToPhp: 58, now }) // ₱1,160
    expect(over.exceeded).toBe(true)
    expect(over.level).toBe('exceeded')
    expect(over.remainingPhp).toBe(0)
    expect(over.percent).toBe(100)
  })

  it('has no limit when budget is null', () => {
    const s = summarizeBudget({ spentUsd: 3, budgetPhp: null, usdToPhp: 58, now })
    expect(s).toMatchObject({ usedPhp: 174, budgetPhp: null, remainingPhp: null, percent: null, exceeded: false, level: 'ok' })
  })
})

describe('readBudgetConfig', () => {
  it('parses env values', () => {
    expect(readBudgetConfig({ AGENT_MONTHLY_BUDGET_PHP: '1500', AGENT_USD_TO_PHP: '57.5' })).toEqual({
      budgetPhp: 1500,
      usdToPhp: 57.5,
    })
  })

  it('defaults: no budget, rate 58; ignores invalid values', () => {
    expect(readBudgetConfig({})).toEqual({ budgetPhp: null, usdToPhp: 58 })
    expect(readBudgetConfig({ AGENT_MONTHLY_BUDGET_PHP: 'abc', AGENT_USD_TO_PHP: '-1' })).toEqual({
      budgetPhp: null,
      usdToPhp: 58,
    })
  })
})

describe('checkBudgetGate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    db.from.mockReset()
    vi.restoreAllMocks()
  })

  it('skips the DB entirely when no budget is set', async () => {
    vi.stubEnv('AGENT_MONTHLY_BUDGET_PHP', '')
    expect(await checkBudgetGate()).toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('allows the turn while under budget', async () => {
    vi.stubEnv('AGENT_MONTHLY_BUDGET_PHP', '1000')
    db.from.mockReturnValue(usageRows({ data: [{ cost_usd: 1 }], error: null })) // ₱58
    expect(await checkBudgetGate()).toBeNull()
  })

  it('returns 402 budget_exceeded once the budget is reached', async () => {
    vi.stubEnv('AGENT_MONTHLY_BUDGET_PHP', '100')
    db.from.mockReturnValue(usageRows({ data: [{ cost_usd: 2 }], error: null })) // ₱116
    const res = await checkBudgetGate()
    expect(res?.status).toBe(402)
    expect(await res?.json()).toMatchObject({ error: 'budget_exceeded' })
  })

  it('fails closed with 503 budget_unavailable when usage cannot be loaded', async () => {
    vi.stubEnv('AGENT_MONTHLY_BUDGET_PHP', '1000')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.from.mockReturnValue(usageRows({ data: null, error: { message: 'relation does not exist' } }))
    const res = await checkBudgetGate()
    expect(res?.status).toBe(503)
    expect(await res?.json()).toEqual({ error: 'budget_unavailable' })
  })
})
