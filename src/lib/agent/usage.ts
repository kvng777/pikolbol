import { supabase } from '@/lib/supabase-server'

/** Claude Sonnet 5.5 list prices, USD per token. Update if the model or pricing changes. */
const PRICE_PER_TOKEN_USD = {
  input: 2 / 1_000_000,
  cacheRead: 0.2 / 1_000_000,
  cacheWrite: 2.5 / 1_000_000, // 5-minute cache write = 1.25x input
  output: 10 / 1_000_000,
}
const DEFAULT_USD_TO_PHP = 58
const WARNING_PERCENT = 80

export interface TurnTokens {
  noCacheInput: number
  cacheRead: number
  cacheWrite: number
  output: number
}

export function turnCostUsd(t: TurnTokens): number {
  return (
    t.noCacheInput * PRICE_PER_TOKEN_USD.input +
    t.cacheRead * PRICE_PER_TOKEN_USD.cacheRead +
    t.cacheWrite * PRICE_PER_TOKEN_USD.cacheWrite +
    t.output * PRICE_PER_TOKEN_USD.output
  )
}

/** Current Manila calendar month as [startUtc, endUtc) ISO instants, plus the reset date (1st of next month). */
export function manilaMonthWindow(now: Date = new Date()) {
  const manila = new Date(now.getTime() + 8 * 3_600_000) // shift so UTC getters read Manila wall time
  const y = manila.getUTCFullYear()
  const m = manila.getUTCMonth()
  const start = Date.UTC(y, m, 1) - 8 * 3_600_000
  const end = Date.UTC(y, m + 1, 1) - 8 * 3_600_000
  const next = new Date(Date.UTC(y, m + 1, 1))
  return {
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(end).toISOString(),
    resetsOn: next.toISOString().slice(0, 10),
  }
}

export type BudgetLevel = 'ok' | 'warning' | 'exceeded'

export interface BudgetSummary {
  usedPhp: number
  budgetPhp: number | null
  remainingPhp: number | null
  percent: number | null
  level: BudgetLevel
  exceeded: boolean
  resetsOn: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeBudget(args: {
  spentUsd: number
  budgetPhp: number | null
  usdToPhp: number
  now?: Date
}): BudgetSummary {
  const usedPhp = round2(args.spentUsd * args.usdToPhp)
  const { resetsOn } = manilaMonthWindow(args.now)
  if (args.budgetPhp === null) {
    return { usedPhp, budgetPhp: null, remainingPhp: null, percent: null, level: 'ok', exceeded: false, resetsOn }
  }
  const exceeded = usedPhp >= args.budgetPhp
  const percent = Math.min(100, round2((usedPhp / args.budgetPhp) * 100))
  return {
    usedPhp,
    budgetPhp: args.budgetPhp,
    remainingPhp: round2(Math.max(0, args.budgetPhp - usedPhp)),
    percent,
    level: exceeded ? 'exceeded' : percent >= WARNING_PERCENT ? 'warning' : 'ok',
    exceeded,
    resetsOn,
  }
}

export function readBudgetConfig(env: Record<string, string | undefined> = process.env) {
  const budget = Number(env.AGENT_MONTHLY_BUDGET_PHP)
  const rate = Number(env.AGENT_USD_TO_PHP)
  return {
    budgetPhp: env.AGENT_MONTHLY_BUDGET_PHP && Number.isFinite(budget) && budget > 0 ? budget : null,
    usdToPhp: env.AGENT_USD_TO_PHP && Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_PHP,
  }
}

// ---------------------------------------------------------------------------
// Server-side persistence (service role)
// ---------------------------------------------------------------------------

export async function recordUsage(row: {
  adminUserId: string
  threadId: string
  model: string
  tokens: TurnTokens
}): Promise<void> {
  const { error } = await supabase.from('agent_usage').insert({
    admin_user_id: row.adminUserId,
    thread_id: row.threadId,
    model: row.model,
    input_tokens: row.tokens.noCacheInput,
    cache_read_tokens: row.tokens.cacheRead,
    cache_write_tokens: row.tokens.cacheWrite,
    output_tokens: row.tokens.output,
    cost_usd: turnCostUsd(row.tokens),
  })
  if (error) throw new Error(`Failed to record usage: ${error.message}`)
}

/** Total spend (USD) across ALL admins for the current Manila month — the API key is shared. */
export async function getMonthSpendUsd(now: Date = new Date()): Promise<number> {
  const { startUtc, endUtc } = manilaMonthWindow(now)
  let total = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('agent_usage')
      .select('cost_usd')
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`Failed to load usage: ${error.message}`)
    for (const r of data ?? []) total += Number(r.cost_usd)
    if (!data || data.length < 1000) break
  }
  return total
}

export async function getBudgetSummary(now: Date = new Date()): Promise<BudgetSummary> {
  const { budgetPhp, usdToPhp } = readBudgetConfig()
  return summarizeBudget({ spentUsd: await getMonthSpendUsd(now), budgetPhp, usdToPhp, now })
}
