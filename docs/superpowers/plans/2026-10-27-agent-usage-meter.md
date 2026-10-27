# Admin Assistant — Monthly AI Budget Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show admins how much of the monthly AI budget the Pikol Assistant has used (a ₱ progress bar in the drawer), and block new questions on the server once the budget is reached.

**Architecture:**
- Anthropic exposes no "remaining credit" API for normal keys, so the app meters itself. After each chat turn, `streamText`'s `onEnd` reports `totalUsage`; the server converts those tokens into USD at Sonnet 5.5 prices and inserts one row into `agent_usage`.
- A pure budget function sums the current **Manila calendar month** and compares the total with `AGENT_MONTHLY_BUDGET_PHP`.
- The chat route refuses new turns (HTTP 402, `{ error: 'budget_exceeded' }`) once the month's total reaches the budget.
- `GET /api/admin/agent/usage` feeds a small `AgentUsageBar` in the drawer header. The bar refreshes after every answer.

**Tech Stack:** As in `2026-10-26-admin-ai-agent.md`: AI SDK v7, Supabase service-role client, React Query, Vitest.

**Decisions (from the owner):**
- Display a ₱ progress bar: "₱420 / ₱1,000", amber at ≥80%, red at 100%.
- At 100%, **block** new questions until the 1st of next month (Manila time).
- The budget comes from an env var: `AGENT_MONTHLY_BUDGET_PHP` (e.g. `1000`) and `AGENT_USD_TO_PHP` (exchange rate, default `58`).
- If `AGENT_MONTHLY_BUDGET_PHP` is unset or invalid, there is no limit. The bar shows "₱X used this month" with no cap and nothing is blocked.

**Known limits (document them, don't fix):**
- A single in-flight turn can overshoot the budget by the cost of that turn, roughly ₱5–20. The check runs before the turn starts.
- The meter counts only this app's usage. It also misses a turn that crashes before `onEnd`.
- Keep the Anthropic Console spend limit as the hard backstop.

**Verified API facts (ai@7.0.154 `index.d.ts`):**
- `LanguageModelUsage` has `inputTokens`, `outputTokens`, `inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens }` and `outputTokenDetails: { reasoningTokens }`. All of these are `number | undefined`.
- `streamText({ onEnd })` receives an event with `totalUsage: LanguageModelUsage`, summed across steps.
- The implementer must confirm exact field paths in the d.ts before using them.

**Pricing (Claude Sonnet 5.5, USD per 1M tokens):**
- Input: $2.00.
- Output: $10.00. Reasoning tokens are already included in `outputTokens`; don't add them twice.
- Cache read: $0.20.
- Cache write (5-minute TTL): $2.50, which is 1.25× input.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `sql/agent-usage-migration.sql` | Create | `agent_usage` table |
| `src/lib/agent/usage.ts` | Create | Pure: `turnCostUsd`, `manilaMonthWindow`, `summarizeBudget`, `readBudgetConfig`; server: `recordUsage`, `getMonthSpendUsd` |
| `src/lib/agent/usage.test.ts` | Create | Unit tests for the pure functions |
| `src/app/api/admin/agent/route.ts` | Modify | Budget check before `streamText`; `onEnd` → `recordUsage` |
| `src/app/api/admin/agent/usage/route.ts` | Create | `GET` usage summary (admin-only) |
| `src/hooks/useAgentUsage.ts` | Create | React Query hook `['agentUsage']` |
| `src/components/admin/agent/AgentUsageBar.tsx` | Create | Bar UI |
| `src/components/admin/agent/AgentDrawer.tsx` | Modify | Render bar under header |
| `src/components/admin/agent/AgentChat.tsx` | Modify | Refresh usage after each answer; disable input + message when exceeded; friendly 402 message |
| `.env.local.example`, `CLAUDE.md` | Modify | Document env vars + meter |

---

### Task 1: SQL migration

- [ ] **Step 1: Create `sql/agent-usage-migration.sql`**

```sql
-- =============================================
-- Admin AI Assistant: per-turn token usage & cost (monthly budget meter)
-- Run in Supabase SQL Editor
-- =============================================

create table if not exists agent_usage (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text,
  model text not null,
  input_tokens integer not null default 0,        -- uncached input
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_usage_created_at on agent_usage(created_at);

-- RLS on with NO policies: service role only.
alter table agent_usage enable row level security;
```

- [ ] **Step 2: Commit.** The owner applies it in Supabase manually.

```bash
git add sql/agent-usage-migration.sql
git commit -m "feat(agent): add agent_usage table for monthly budget meter"
```

---

### Task 2: Pure usage/budget functions (TDD)

**Files:** Create `src/lib/agent/usage.ts` and `src/lib/agent/usage.test.ts`.

- [ ] **Step 1: Write the failing tests in `src/lib/agent/usage.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ supabase: {} }))

import { turnCostUsd, manilaMonthWindow, summarizeBudget, readBudgetConfig } from './usage'

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
```

- [ ] **Step 2: Run `npm test`.** Expect a FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/agent/usage.ts`**

```ts
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
```

- [ ] **Step 4: Run `npm test`.** Expect a PASS. Check the expected values by hand if one is off, and don't loosen the assertions.

- [ ] **Step 5: Commit** with `feat(agent): add usage cost and monthly budget calculations`.

---

### Task 3: Server wiring

**Files:** Modify `src/app/api/admin/agent/route.ts`; create `src/app/api/admin/agent/usage/route.ts`.

- [ ] **Step 1: Add the budget gate in `route.ts`.** Put it after the body is parsed and before `ensureThread`:

```ts
const budget = await getBudgetSummary()
if (budget.exceeded) {
  return Response.json(
    { error: 'budget_exceeded', resetsOn: budget.resetsOn },
    { status: 402 }
  )
}
```

- [ ] **Step 2: Record usage in `streamText`'s `onEnd`.** It receives `totalUsage`; confirm the exact callback event shape in `node_modules/ai/dist/index.d.ts` (`StreamTextOnEndCallback`).

```ts
onEnd: async ({ totalUsage }) => {
  const d = totalUsage.inputTokenDetails
  const cacheRead = d?.cacheReadTokens ?? 0
  const cacheWrite = d?.cacheWriteTokens ?? 0
  const noCacheInput = d?.noCacheTokens ?? Math.max(0, (totalUsage.inputTokens ?? 0) - cacheRead - cacheWrite)
  try {
    await recordUsage({
      adminUserId: auth.userId,
      threadId,
      model: AGENT_MODEL,
      tokens: { noCacheInput, cacheRead, cacheWrite, output: totalUsage.outputTokens ?? 0 },
    })
  } catch (error) {
    console.error('Failed to record agent usage:', error)
  }
},
```

If `streamText`'s `onEnd` doesn't fire when the stream is consumed via `consumeSseStream` after a client disconnect, read `await result.totalUsage` inside the UI stream's `onEnd` instead, and report which approach you used.

- [ ] **Step 3: Create `src/app/api/admin/agent/usage/route.ts`.**

```ts
import { requireAdmin } from '@/lib/agent/auth'
import { getBudgetSummary } from '@/lib/agent/usage'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth
  return Response.json(await getBudgetSummary())
}
```

- [ ] **Step 4:** Run `npx tsc --noEmit` and `npm test`. Then run a curl check on a dev server with no token: `GET /api/admin/agent/usage` should return 401.

- [ ] **Step 5: Commit** with `feat(agent): enforce monthly budget and record token usage`.

---

### Task 4: UI meter

**Files:**
- Create `src/hooks/useAgentUsage.ts` and `src/components/admin/agent/AgentUsageBar.tsx`.
- Modify `AgentDrawer.tsx` and `AgentChat.tsx`.

- [ ] **Step 1: Write `useAgentUsage.ts`.**
  - Use `useQuery({ queryKey: ['agentUsage'], queryFn, enabled, staleTime: 30_000 })`.
  - `queryFn` fetches `/api/admin/agent/usage` with the Bearer token from `getAccessToken()` (exported by `useAgentThread.ts`).
  - It returns a `BudgetSummary`. Use `import type { BudgetSummary } from '@/lib/agent/usage'`, a type-only import so no server code is bundled.
  - It throws on `!res.ok`.

- [ ] **Step 2: Write `AgentUsageBar.tsx`.** Its props are `{ usage?: BudgetSummary; isLoading: boolean }`.

  | State | What it renders |
  |---|---|
  | `isLoading` | A thin grey placeholder bar |
  | `budgetPhp === null` | `"₱{used} used this month"`, no bar |
  | Otherwise | A 6px-high bar; fill width = `percent%` |

  - Bar fill colour by `level`: emerald for `ok`, amber for `warning`, red for `exceeded`.
  - Right-side label: `"₱{used} / ₱{budget}"`. Format with `toLocaleString('en-PH', { maximumFractionDigits: 0 })`.
  - Sub-line text: `"{percent}% of monthly AI budget used"`. When `exceeded`, use `"Monthly AI budget reached — resets {Mon D}"` instead.
  - Add `role="progressbar"`, `aria-valuenow={percent}`, `aria-valuemin={0}`, `aria-valuemax={100}` and an `aria-label`.
  - Keep it compact: `px-4 py-2 border-b border-gray-100 text-xs`.

- [ ] **Step 3: Update `AgentDrawer.tsx`.**
  - Call `useAgentUsage({ enabled: everOpened })`.
  - Render `<AgentUsageBar>` directly under the header row, only after the first open.
  - Pass `budgetExceeded={usage.data?.exceeded ?? false}` into `AgentChat`.

- [ ] **Step 4: Update `AgentChat.tsx`.**
  - Add `useChat({ onFinish: () => queryClient.invalidateQueries({ queryKey: ['agentUsage'] }) })`, so the bar refreshes after every answer.
  - When `budgetExceeded`:
    - Disable the textarea and the send button.
    - Hide the suggestion buttons.
    - Show the notice `"This month's AI budget has been reached. The assistant will be available again on {resetsOn}."` in place of the placeholder.
  - When the POST fails with a 402, the `error` from useChat shows a friendly budget message instead of "Something went wrong", and the usage query is invalidated. Inspect `error.message`: the transport puts the response body text in it, so check for `budget_exceeded`. Verify this in `node_modules/ai` `HttpChatTransport`.
  - Don't show Retry for budget errors.

- [ ] **Step 5:** Run `npx tsc --noEmit`, eslint on the agent files, and `npm run build`.

- [ ] **Step 6: Commit** with `feat(agent): show monthly AI budget meter in assistant drawer`.

---

### Task 5: Docs + env

- [ ] **Step 1: Append to `.env.local.example`.**

```bash
# Monthly AI budget for the admin assistant (PHP). Unset = no limit. Requests are blocked once reached.
AGENT_MONTHLY_BUDGET_PHP=1000
# Exchange rate used to show USD API cost in pesos.
AGENT_USD_TO_PHP=58
```

- [ ] **Step 2: Update the CLAUDE.md "Admin AI Assistant" section.**
  - Describe the meter: the `agent_usage` table (`sql/agent-usage-migration.sql`), `GET /api/admin/agent/usage`, the env vars, the 402 block, the Manila month reset, the self-metering limits (a turn can overshoot; only this app's usage counts), and that prices live in `lib/agent/usage.ts`.
  - Add the query key `['agentUsage']`.

- [ ] **Step 3: Commit** with `docs: document assistant budget meter`.

---

## Verification (with the owner)

1. Apply `sql/agent-usage-migration.sql` in Supabase.
2. Set `AGENT_MONTHLY_BUDGET_PHP=1000` in `.env.local`, then restart the dev server with `env -u ANTHROPIC_API_KEY`.
3. Ask a question. The bar should move by a few pesos, and a row should appear in `agent_usage`.
4. Set `AGENT_MONTHLY_BUDGET_PHP=1` and restart. The bar should be red with "budget reached", input disabled, and a direct POST should return 402.
5. Restore the budget value.
