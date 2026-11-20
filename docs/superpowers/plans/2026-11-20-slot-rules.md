# Slot Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins block time slots with reusable rules (recurring, one-off ranges, opening hours) instead of one slot per date, and every booking path enforces blocks on the server.

**Architecture:** A new `slot_rules` table holds rules (optional label, start/end date, ISO weekdays, time slots). A pure module (`lib/slotRules.ts`) answers "is this slot blocked on this date?" on both client and server. A server helper (`lib/slotAvailability.ts`) combines rules, one-day blocks (`disabled_slots`) and closed dates, and is called by every booking write path; it fails closed. Slot display (`getAvailableSlotsForCourt`) gains a `rule` reason with the rule's label. Admins manage rules in a new section of the Time Slots tab.

**Tech Stack:** Next.js App Router server actions, Supabase (service role), Zod v4, React Query, Vitest, TailwindCSS + Shadcn.

**Spec:** `docs/superpowers/specs/2026-11-20-slot-rules-design.md`

---

## Conventions (read once)

- Protected server actions take `accessToken` first and call `requireAdmin(accessToken)` before anything else (`src/lib/actionAuth.ts`). Hooks pass `await getAccessToken()` (`src/lib/accessToken.ts`). Every new admin action must be added to `ADMIN_ACTIONS` in `src/actions/actionGuards.test.ts`.
- Manila date: `manilaNow(now).date` from `src/lib/agent/dates.ts`. Date math: `addDaysIso` from `src/lib/pricing.ts`. Hours: `formatHour` from `src/lib/pricing.ts` (`7` → `7 AM`, `24` → `12 AM`).
- Slot strings are `"HH:00-HH:00"` from `generateTimeSlots()` (`"05:00-06:00"` … `"23:00-00:00"`).
- Vitest only runs `src/lib/agent/**/*.test.ts`, `src/lib/*.test.ts` and `src/actions/**/*.test.ts` (`vitest.config.mts`). Put tests there.
- Local `.env.local` points at the **production** database. Never run SQL or write paths against it without the owner's explicit OK.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/slot-rules`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `sql/slot-rules-migration.sql` | create | `slot_rules` table, constraints, RLS |
| `src/types/slotRules.ts` | create | `SlotRule`, `SlotRuleInput`, `RuleOverlapBooking`, `SlotRuleStatus` |
| `src/lib/slotRules.ts` (+ `.test.ts`) | create | Pure rule logic and wording |
| `src/lib/slotRulesSchema.ts` (+ `.test.ts`) | create | Zod input schema |
| `src/lib/slotRulesService.ts` (+ `.test.ts`) | create | CRUD, rules for a date, overlap query; fails closed |
| `src/lib/slotAvailability.ts` (+ `.test.ts`) | create | `findBlockedSlots` (rules + disabled + closed) for write paths |
| `src/lib/timeSlotGenerator.ts` (+ new `src/lib/timeSlotGenerator.test.ts`) | modify | `rules` option, `reason: 'rule'`, `label` |
| `src/types/booking.ts` | modify | `TimeSlot.reason` adds `'rule'`, `TimeSlot.label`, `AdminBookingPayload.overrideBlocks` |
| `src/actions/payment.ts` | modify | Reject blocked slots on customer submit |
| `src/lib/bookingService.ts` | modify | Enforce in admin create/update (override), reschedule request + approval |
| `src/actions/slotRules.ts` | create | Public + admin actions |
| `src/hooks/useSlotRules.ts` | create | Queries + mutations |
| `src/components/booking/TimeSlotPicker.tsx` | modify | Show rule label; `loadError` state |
| `src/components/home/BookSection.tsx`, `src/app/page.tsx` | modify | Pass rules, fail closed |
| `src/components/profile/RescheduleModal.tsx` | modify | Pass rules, fail closed |
| `src/components/admin/AdminBookingForm.tsx` | modify | Show blocks, override confirmation |
| `src/app/admin/ui/TodaySummary.tsx` | modify | Count rule-blocked slots |
| `src/components/admin/SlotRuleForm.tsx` | create | Rule form (weekday shortcuts, drag-select grid, review) |
| `src/components/admin/SlotRulesSection.tsx` | create | Rule list with Edit/End/Delete |
| `src/app/admin/page.tsx` | modify | Mount `SlotRulesSection` in the Time Slots tab |
| `src/lib/agent/summaries.ts`, `src/lib/agent/tools.ts`, `src/lib/agent/summaries.test.ts` | modify | Assistant reports rule blocks |
| `src/actions/actionGuards.test.ts`, `src/lib/bookingService.pricing.test.ts` | modify | Mocks + new tests |
| `docs/features/slots-and-closures.md`, `CLAUDE.md` | modify | Docs |

---

### Task 1: Database migration (owner applies it)

**Files:**
- Create: `sql/slot-rules-migration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================
-- Pikolbol Slot Rules Migration
-- Run this in your Supabase SQL Editor
-- (Reusable time-slot blocks: a slot on date D is blocked when
--  start_date <= D, end_date IS NULL OR D <= end_date,
--  ISO weekday(D) is in weekdays, and the slot is in time_slots.)
-- =============================================

CREATE TABLE IF NOT EXISTS slot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30),  -- NULL → customers see "Blocked"
  start_date DATE NOT NULL,                                                -- First play date (Asia/Manila)
  end_date DATE CHECK (end_date IS NULL OR end_date >= start_date),        -- Inclusive; NULL = no end
  weekdays SMALLINT[] NOT NULL
    CHECK (cardinality(weekdays) >= 1 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),  -- 1 = Mon … 7 = Sun
  time_slots TEXT[] NOT NULL CHECK (cardinality(time_slots) >= 1),         -- e.g. {'07:00-08:00'}
  created_by UUID,                                                         -- Admin user id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slot_rules_dates_idx ON slot_rules (start_date, end_date);

-- RLS on, no policies: only the service role (server) can read/write
ALTER TABLE slot_rules ENABLE ROW LEVEL SECURITY;

-- Verify:
-- SELECT count(*) FROM slot_rules;   → 0
```

- [ ] **Step 2: Commit**

```bash
git add sql/slot-rules-migration.sql
git commit -m "feat(slots): add slot_rules migration"
```

- [ ] **Step 3: STOP. The owner applies the SQL.**

Do not run it yourself. Ask the owner to paste the file into the Supabase SQL editor, run it, then run the verify query (expect `0`). The migration is additive, so the live app keeps working. Continue only after the owner confirms. Tasks 2–5 only use mocks, so they may proceed meanwhile; Task 6 onward needs the table for manual checks.

---

### Task 2: Types and pure rule logic

**Files:**
- Create: `src/types/slotRules.ts`
- Create: `src/lib/slotRules.ts`
- Test: `src/lib/slotRules.test.ts`

- [ ] **Step 1: Create the types**

`src/types/slotRules.ts`:

```ts
/** A reusable time-slot block. Dates are Asia/Manila play dates ('YYYY-MM-DD'). */
export interface SlotRule {
  id: string
  label: string | null        // null → customers see "Blocked"
  start_date: string
  end_date: string | null     // inclusive; null = no end
  weekdays: number[]          // ISO: 1 = Monday … 7 = Sunday
  time_slots: string[]        // '07:00-08:00' format
  created_by: string | null
  created_at: string
  updated_at: string
}

/** What the rule logic needs (lets client code pass rules without audit fields). */
export type SlotRuleLike = Pick<SlotRule, 'label' | 'start_date' | 'end_date' | 'weekdays' | 'time_slots'>

/** Admin form / action input (camelCase, validated by slotRuleInputSchema). */
export interface SlotRuleInput {
  label: string | null
  startDate: string
  endDate: string | null
  weekdays: number[]
  timeSlots: string[]
}

/** An existing active booking that a rule would cover. */
export interface RuleOverlapBooking {
  shortId: string | null
  date: string
  timeSlot: string
  name: string
  status: string
}

export type SlotRuleStatus = 'active' | 'upcoming' | 'ended'
```

- [ ] **Step 2: Write the failing test**

`src/lib/slotRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isoWeekday,
  ruleAppliesOnDate,
  findBlockingRule,
  ruleLabel,
  ruleStatus,
  describeWeekdays,
  describeTimeSlots,
  describeRule,
  DEFAULT_RULE_LABEL,
} from './slotRules'
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
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/lib/slotRules.test.ts`
Expected: FAIL (cannot resolve `./slotRules`).

- [ ] **Step 4: Implement**

`src/lib/slotRules.ts`:

```ts
/**
 * Slot rules: pure logic shared by client and server.
 * A slot on date D is blocked by a rule when D is within [start_date, end_date],
 * D's ISO weekday is in weekdays, and the slot is in time_slots.
 */
import { formatHour } from './pricing'
import type { SlotRuleLike, SlotRuleStatus } from '@/types/slotRules'

export const DEFAULT_RULE_LABEL = 'Blocked'
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** ISO weekday of a 'YYYY-MM-DD' date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

export function ruleAppliesOnDate(rule: Pick<SlotRuleLike, 'start_date' | 'end_date' | 'weekdays'>, date: string): boolean {
  if (date < rule.start_date) return false
  if (rule.end_date !== null && date > rule.end_date) return false
  return rule.weekdays.includes(isoWeekday(date))
}

/** The first rule that blocks `slot` on `date`, or null. */
export function findBlockingRule<R extends SlotRuleLike>(rules: R[], date: string, slot: string): R | null {
  return rules.find((r) => r.time_slots.includes(slot) && ruleAppliesOnDate(r, date)) ?? null
}

export function ruleLabel(rule: Pick<SlotRuleLike, 'label'>): string {
  return rule.label?.trim() || DEFAULT_RULE_LABEL
}

export function ruleStatus(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>, today: string): SlotRuleStatus {
  if (rule.end_date !== null && rule.end_date < today) return 'ended'
  if (rule.start_date > today) return 'upcoming'
  return 'active'
}

export function describeWeekdays(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b)
  const key = days.join(',')
  if (key === '1,2,3,4,5,6,7') return 'every day'
  if (key === '1,2,3,4,5') return 'weekdays'
  if (key === '6,7') return 'weekends'
  return days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')
}

/** '07:00-08:00' + '08:00-09:00' → '7 AM - 9 AM'. */
export function describeTimeSlots(slots: string[]): string {
  const starts = [...new Set(slots.map((s) => Number(s.slice(0, 2))))].sort((a, b) => a - b)
  const ranges: string[] = []
  let i = 0
  while (i < starts.length) {
    let j = i
    while (j + 1 < starts.length && starts[j + 1] === starts[j] + 1) j++
    ranges.push(`${formatHour(starts[i])} - ${formatHour(starts[j] + 1)}`)
    i = j + 1
  }
  return ranges.join(', ')
}

function formatRuleDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function describeRuleDates(rule: Pick<SlotRuleLike, 'start_date' | 'end_date'>): string {
  return rule.end_date === null
    ? `from ${formatRuleDate(rule.start_date)}`
    : `${formatRuleDate(rule.start_date)} – ${formatRuleDate(rule.end_date)}`
}

/** "Open Play: 7 AM - 11 AM, every day, from Nov 20, 2026" */
export function describeRule(rule: SlotRuleLike): string {
  return `${ruleLabel(rule)}: ${describeTimeSlots(rule.time_slots)}, ${describeWeekdays(rule.weekdays)}, ${describeRuleDates(rule)}`
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/slotRules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/slotRules.ts src/lib/slotRules.ts src/lib/slotRules.test.ts
git commit -m "feat(slots): add pure slot rule logic"
```

---

### Task 3: Input schema

**Files:**
- Create: `src/lib/slotRulesSchema.ts`
- Test: `src/lib/slotRulesSchema.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/slotRulesSchema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/slotRulesSchema.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/slotRulesSchema.ts`:

```ts
import { z } from 'zod'
import { isRealDate } from './agent/dates'
import { generateTimeSlots } from './timeSlotGenerator'

export const MAX_RULE_LABEL = 30

const SLOTS = new Set(generateTimeSlots())
const isoDate = z.string().refine(isRealDate, 'Enter a valid date')
const unique = <T,>(values: T[]) => new Set(values).size === values.length

/** Admin input for creating or editing a slot rule (shared by the form and the server). */
export const slotRuleInputSchema = z
  .strictObject({
    label: z
      .string()
      .trim()
      .max(MAX_RULE_LABEL, `Label must be ${MAX_RULE_LABEL} characters or fewer`)
      .nullable()
      .transform((v) => (v ? v : null)),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day')
      .refine(unique, 'Days must be unique'),
    timeSlots: z
      .array(z.string().refine((s) => SLOTS.has(s), 'Unknown time slot'))
      .min(1, 'Pick at least one time slot')
      .refine(unique, 'Time slots must be unique'),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  })
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/slotRulesSchema.test.ts`
Expected: PASS. If zod v4 rejects `.trim()` before `.max()` ordering or `.refine` on a strict object, adapt minimally and keep every test passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slotRulesSchema.ts src/lib/slotRulesSchema.test.ts
git commit -m "feat(slots): add slot rule input schema"
```

---

### Task 4: Slot rules service (server)

**Files:**
- Create: `src/lib/slotRulesService.ts`
- Test: `src/lib/slotRulesService.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/slotRulesService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase-server', () => ({ supabase: { from } }))

import {
  getSlotRulesForDate,
  listSlotRules,
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
  time_slots: ['07:00-08:00'], created_by: 'a1', created_at: 'x', updated_at: 'x', ...over,
})
const input = { label: 'Open Play', startDate: '2026-11-20', endDate: null, weekdays: [1, 2, 3, 4, 5, 6, 7], timeSlots: ['07:00-08:00'] }
const NOW = new Date('2026-11-21T04:00:00Z') // Manila 2026-11-21 12:00

describe('slotRulesService', () => {
  beforeEach(() => from.mockReset())

  it('getSlotRulesForDate filters by range in SQL and by weekday in code', async () => {
    const calls = stub({ data: [row(), row({ id: 'r2', weekdays: [1] })], error: null })
    const rules = await getSlotRulesForDate('2026-11-21') // Saturday
    expect(rules.map((r) => r.id)).toEqual(['r1'])
    expect(calls).toContainEqual({ method: 'lte', args: ['start_date', '2026-11-21'] })
    expect(calls).toContainEqual({ method: 'or', args: ['end_date.is.null,end_date.gte.2026-11-21'] })
  })

  it('fails closed when rules cannot be read', async () => {
    stub({ data: null, error: { message: 'down' } })
    await expect(getSlotRulesForDate('2026-11-21')).rejects.toBeInstanceOf(AvailabilityUnavailableError)
    await expect(listSlotRules()).rejects.toBeInstanceOf(AvailabilityUnavailableError)
  })

  it('createSlotRule validates, sorts and records the creator', async () => {
    const calls = stub({ data: row(), error: null })
    const res = await createSlotRule({ ...input, weekdays: [3, 1], timeSlots: ['08:00-09:00', '07:00-08:00'] }, 'a1')
    expect(res.success).toBe(true)
    const insert = calls.find((c) => c.method === 'insert')!
    expect(insert.args[0]).toEqual({
      label: 'Open Play', start_date: '2026-11-20', end_date: null, weekdays: [1, 3],
      time_slots: ['07:00-08:00', '08:00-09:00'], created_by: 'a1',
    })
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
    const calls = stub({ data: { start_date: '2026-11-01', end_date: null }, error: null }, { data: null, error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: true, deleted: false })
    const update = calls.find((c) => c.method === 'update')!
    expect((update.args[0] as Record<string, unknown>).end_date).toBe('2026-11-20')
  })

  it('endSlotRule deletes a rule that has not started before today', async () => {
    const calls = stub({ data: { start_date: '2026-11-21', end_date: null }, error: null }, { data: null, error: null })
    expect(await endSlotRule('r1', NOW)).toEqual({ success: true, deleted: true })
    expect(calls.some((c) => c.method === 'delete')).toBe(true)
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
    expect(res).toEqual([{ shortId: 'A1', date: '2026-11-23', timeSlot: '07:00-08:00', name: 'Ann', status: 'confirmed' }])
    expect(calls).toContainEqual({ method: 'gte', args: ['date', '2026-11-21'] }) // clamped to today
    expect(calls).toContainEqual({ method: 'in', args: ['payment_status', ['pending', 'confirmed']] })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/slotRulesService.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/slotRulesService.ts`:

```ts
/**
 * Slot Rules Service (service role only).
 * Reads fail closed: a read error throws AvailabilityUnavailableError so booking writes reject.
 */
import { supabase } from './supabase-server'
import { slotRuleInputSchema } from './slotRulesSchema'
import { isoWeekday, ruleAppliesOnDate } from './slotRules'
import { manilaNow } from './agent/dates'
import { addDaysIso } from './pricing'
import type { SlotRule, SlotRuleInput, RuleOverlapBooking } from '@/types/slotRules'

export class AvailabilityUnavailableError extends Error {
  constructor() {
    super('Availability is unavailable right now. Please try again in a moment.')
    this.name = 'AvailabilityUnavailableError'
  }
}

export type SlotRuleResult = { success: true; rule: SlotRule } | { success: false; error: string }
export type EndSlotRuleResult = { success: true; deleted: boolean } | { success: false; error: string }

const COLUMNS = 'id, label, start_date, end_date, weekdays, time_slots, created_by, created_at, updated_at'
/** How far ahead the overlap check looks for rules without an end date. */
const OVERLAP_HORIZON_DAYS = 366

function readFailed(context: string, error: unknown): never {
  console.error(`Slot rules: ${context}`, error)
  throw new AvailabilityUnavailableError()
}

function parseInput(input: unknown): { ok: true; data: SlotRuleInput } | { ok: false; error: string } {
  const parsed = slotRuleInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule' }
  return { ok: true, data: parsed.data }
}

function toRow(input: SlotRuleInput) {
  return {
    label: input.label,
    start_date: input.startDate,
    end_date: input.endDate,
    weekdays: [...input.weekdays].sort((a, b) => a - b),
    time_slots: [...input.timeSlots].sort(),
  }
}

/** All rules, newest start first (admin list). */
export async function listSlotRules(): Promise<SlotRule[]> {
  const { data, error } = await supabase.from('slot_rules').select(COLUMNS).order('start_date', { ascending: false })
  if (error) readFailed('list', error)
  return (data ?? []) as SlotRule[]
}

/** Rules that are active or upcoming on/after `today` (what customer screens need). */
export async function listCurrentSlotRules(today: string): Promise<SlotRule[]> {
  const { data, error } = await supabase
    .from('slot_rules')
    .select(COLUMNS)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: true })
  if (error) readFailed('list current', error)
  return (data ?? []) as SlotRule[]
}

/** Rules that block something on `date`. */
export async function getSlotRulesForDate(date: string): Promise<SlotRule[]> {
  const { data, error } = await supabase
    .from('slot_rules')
    .select(COLUMNS)
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
  if (error) readFailed('rules for date', error)
  return ((data ?? []) as SlotRule[]).filter((r) => ruleAppliesOnDate(r, date))
}

export async function createSlotRule(input: unknown, createdBy: string | null): Promise<SlotRuleResult> {
  const parsed = parseInput(input)
  if (!parsed.ok) return { success: false, error: parsed.error }
  const { data, error } = await supabase
    .from('slot_rules')
    .insert({ ...toRow(parsed.data), created_by: createdBy })
    .select(COLUMNS)
    .single()
  if (error || !data) {
    console.error('Slot rules: create', error)
    return { success: false, error: 'Failed to save the rule' }
  }
  return { success: true, rule: data as SlotRule }
}

export async function updateSlotRule(id: string, input: unknown): Promise<SlotRuleResult> {
  const parsed = parseInput(input)
  if (!parsed.ok) return { success: false, error: parsed.error }
  const { data, error } = await supabase
    .from('slot_rules')
    .update({ ...toRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) {
    console.error('Slot rules: update', error)
    return { success: false, error: 'Failed to save the rule' }
  }
  if (!data) return { success: false, error: 'Rule not found' }
  return { success: true, rule: data as SlotRule }
}

/**
 * Stop a rule from today (Manila). A rule that already ran keeps its history (end_date = yesterday);
 * one that starts today or later never applied, so it is deleted.
 */
export async function endSlotRule(id: string, now: Date = new Date()): Promise<EndSlotRuleResult> {
  const today = manilaNow(now).date
  const yesterday = addDaysIso(today, -1)
  const { data: rule, error } = await supabase.from('slot_rules').select('start_date, end_date').eq('id', id).maybeSingle()
  if (error) {
    console.error('Slot rules: end (read)', error)
    return { success: false, error: 'Failed to end the rule' }
  }
  if (!rule) return { success: false, error: 'Rule not found' }
  if (rule.end_date !== null && rule.end_date < today) return { success: false, error: 'This rule has already ended.' }

  if (rule.start_date > yesterday) {
    const { error: delError } = await supabase.from('slot_rules').delete().eq('id', id)
    if (delError) return { success: false, error: 'Failed to end the rule' }
    return { success: true, deleted: true }
  }
  const { error: upError } = await supabase
    .from('slot_rules')
    .update({ end_date: yesterday, updated_at: now.toISOString() })
    .eq('id', id)
  if (upError) return { success: false, error: 'Failed to end the rule' }
  return { success: true, deleted: false }
}

export async function deleteSlotRule(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('slot_rules').delete().eq('id', id)
  if (error) {
    console.error('Slot rules: delete', error)
    return { success: false, error: 'Failed to delete the rule' }
  }
  return { success: true }
}

/**
 * Active (pending/confirmed) bookings a rule would cover, from today (Manila) onward.
 * Rules without an end date are checked up to OVERLAP_HORIZON_DAYS ahead.
 */
export async function findBookingsOverlappingRule(input: SlotRuleInput, now: Date = new Date()): Promise<RuleOverlapBooking[]> {
  const today = manilaNow(now).date
  const horizon = addDaysIso(today, OVERLAP_HORIZON_DAYS)
  const fromDate = input.startDate > today ? input.startDate : today
  const toDate = input.endDate === null || input.endDate > horizon ? horizon : input.endDate
  if (toDate < fromDate) return []

  const { data, error } = await supabase
    .from('bookings')
    .select('short_id, date, time_slot, name, payment_status')
    .gte('date', fromDate)
    .lte('date', toDate)
    .in('payment_status', ['pending', 'confirmed'])
    .in('time_slot', input.timeSlots)
    .order('date', { ascending: true })
    .order('time_slot', { ascending: true })
  if (error) readFailed('overlap', error)

  return (data ?? [])
    .filter((b) => input.weekdays.includes(isoWeekday(b.date)))
    .map((b) => ({ shortId: b.short_id, date: b.date, timeSlot: b.time_slot, name: b.name, status: b.payment_status }))
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/slotRulesService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slotRulesService.ts src/lib/slotRulesService.test.ts
git commit -m "feat(slots): add slot rules service (fails closed)"
```

---

### Task 5: Server availability helper

**Files:**
- Create: `src/lib/slotAvailability.ts`
- Test: `src/lib/slotAvailability.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/slotAvailability.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/slotAvailability.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/slotAvailability.ts`:

```ts
/**
 * Server-side "can these slots be booked?" check used by every booking write path.
 * Combines closed dates, one-day blocks (disabled_slots) and slot rules. Fails closed.
 */
import { supabase } from './supabase-server'
import { getSlotRulesForDate, AvailabilityUnavailableError } from './slotRulesService'
import { findBlockingRule, ruleLabel, DEFAULT_RULE_LABEL } from './slotRules'

export const SLOTS_UNAVAILABLE = 'One or more selected slots are no longer available.'
export const AVAILABILITY_UNAVAILABLE = 'Availability is unavailable right now. Please try again in a moment.'

export interface BlockedSlot {
  slot: string
  source: 'closed' | 'disabled' | 'rule'
  label: string
}

/** Requested slots that can't be booked on `date`. Throws AvailabilityUnavailableError if data can't be read. */
export async function findBlockedSlots(date: string, slots: string[]): Promise<BlockedSlot[]> {
  const [closed, disabled, rules] = await Promise.all([
    supabase.from('closed_dates').select('reason').lte('start_date', date).gte('end_date', date).limit(1),
    supabase.from('disabled_slots').select('time_slot').eq('date', date),
    getSlotRulesForDate(date),
  ])
  if (closed.error || disabled.error) {
    console.error('Availability check failed', closed.error ?? disabled.error)
    throw new AvailabilityUnavailableError()
  }

  if (closed.data && closed.data.length > 0) {
    const label = closed.data[0].reason || 'Closed'
    return slots.map((slot) => ({ slot, source: 'closed' as const, label }))
  }

  const disabledSet = new Set((disabled.data ?? []).map((d) => d.time_slot))
  const blocked: BlockedSlot[] = []
  for (const slot of slots) {
    if (disabledSet.has(slot)) {
      blocked.push({ slot, source: 'disabled', label: DEFAULT_RULE_LABEL })
      continue
    }
    const rule = findBlockingRule(rules, date, slot)
    if (rule) blocked.push({ slot, source: 'rule', label: ruleLabel(rule) })
  }
  return blocked
}

/** Blocks that still apply for an admin booking: overriding skips rules and one-day blocks, never closed dates. */
export function blocksForAdmin(blocked: BlockedSlot[], overrideBlocks: boolean): BlockedSlot[] {
  return overrideBlocks ? blocked.filter((b) => b.source === 'closed') : blocked
}

export function describeBlocked(blocked: BlockedSlot[]): string {
  return blocked.map((b) => `${b.slot} (${b.label})`).join(', ')
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/slotAvailability.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slotAvailability.ts src/lib/slotAvailability.test.ts
git commit -m "feat(slots): add server-side slot availability check"
```

---

### Task 6: Enforce blocks on every booking write path

**Files:**
- Modify: `src/types/booking.ts` (`AdminBookingPayload`)
- Modify: `src/actions/payment.ts`
- Modify: `src/lib/bookingService.ts`
- Modify: `src/actions/actionGuards.test.ts`
- Modify: `src/lib/bookingService.pricing.test.ts`

- [ ] **Step 1: Add `overrideBlocks` to the admin payload type**

In `src/types/booking.ts`, `AdminBookingPayload`:

```ts
export interface AdminBookingPayload {
  name: string
  date: string
  timeSlots: string[]
  paddles?: number
  needsBalls?: boolean
  trainingBalls?: boolean
  /** Admin confirmed booking slots blocked by a rule or one-day block (never overrides closed dates). */
  overrideBlocks?: boolean
}
```

- [ ] **Step 2: Mock the helper in the existing test files (keeps current tests green)**

In `src/lib/bookingService.pricing.test.ts`:
- add `findBlockedSlots: vi.fn()` to the `vi.hoisted` object (rename the destructure to `const { from, getPricingForDate, findBlockedSlots } = vi.hoisted(() => ({ from: vi.fn(), getPricingForDate: vi.fn(), findBlockedSlots: vi.fn() }))`);
- below the other `vi.mock` calls add:

```ts
vi.mock('./slotAvailability', async (orig) => ({
  ...(await orig<typeof import('./slotAvailability')>()),
  findBlockedSlots,
}))
```

- in both top-level `beforeEach` blocks add `findBlockedSlots.mockReset(); findBlockedSlots.mockResolvedValue([])`.

In `src/actions/actionGuards.test.ts`:
- add `vi.mock('@/lib/slotAvailability')` and `vi.mock('@/lib/slotRulesService')` next to the other automocks;
- add `import * as slotAvailability from '@/lib/slotAvailability'` and `import * as slotRulesService from '@/lib/slotRulesService'`;
- append both to `automockedModules`;
- in the `submitPaymentAction` describe's `beforeEach`, add `vi.mocked(slotAvailability.findBlockedSlots).mockResolvedValue([])`. Do the same in any other describe whose `beforeEach` drives `submitPaymentAction` (grep `submitPaymentAction(` in the file).

Run: `npm test`
Expected: PASS (nothing calls the helper yet).

- [ ] **Step 3: Write the failing tests**

Append to the `submitPaymentAction` describe in `src/actions/actionGuards.test.ts`:

```ts
  it('rejects a blocked slot before checking the quote and creates nothing', async () => {
    vi.mocked(slotAvailability.findBlockedSlots).mockResolvedValue([{ slot: '08:00-09:00', source: 'rule', label: 'Open Play' }])
    const quote = realPriceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const res = await payment.submitPaymentAction(null, body, quote)
    expect(res).toEqual({ success: false, error: 'One or more selected slots are no longer available.' })
    expect(priceQuote.verifyPriceQuote).not.toHaveBeenCalled()
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('fails closed when availability cannot be checked', async () => {
    vi.mocked(slotAvailability.findBlockedSlots).mockRejectedValue(new Error('down'))
    const quote = realPriceQuote.createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const res = await payment.submitPaymentAction(null, body, quote)
    expect(res).toEqual({ success: false, error: 'Availability is unavailable right now. Please try again in a moment.' })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })
```

(If `realPriceQuote.createPriceQuote`'s argument order differs, match the existing round-trip test in the same describe.)

Append to `src/lib/bookingService.pricing.test.ts` (new describe at the end; reuses `setup`, `existingRow`, `VERSION`, `DATE`):

```ts
describe('blocked slots are enforced', () => {
  const ruleBlock = [{ slot: '10:00', source: 'rule' as const, label: 'Open Play' }]
  beforeEach(() => {
    from.mockReset(); getPricingForDate.mockReset(); findBlockedSlots.mockReset()
    getPricingForDate.mockResolvedValue(VERSION)
  })

  it('createAdminBooking rejects a blocked slot and saves nothing', async () => {
    findBlockedSlots.mockResolvedValue(ruleBlock)
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00'] })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/no longer available.*10:00 \(Open Play\)/)
    expect(ops.inserted).toHaveLength(0)
  })

  it('createAdminBooking books a blocked slot when the admin overrides', async () => {
    findBlockedSlots.mockResolvedValue(ruleBlock)
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00'], overrideBlocks: true })
    expect(res.success).toBe(true)
    expect(ops.inserted).toHaveLength(1)
  })

  it('an override never books a closed date', async () => {
    findBlockedSlots.mockResolvedValue([{ slot: '10:00', source: 'closed', label: 'Holiday' }])
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00'], overrideBlocks: true })
    expect(res.success).toBe(false)
    expect(ops.inserted).toHaveLength(0)
  })

  it('updateAdminBooking rejects a blocked slot before deleting', async () => {
    findBlockedSlots.mockResolvedValue(ruleBlock)
    const ops = setup([existingRow()])
    const res = await updateAdminBooking('g1', { name: 'Bob', date: DATE, timeSlots: ['10:00'] })
    expect(res.success).toBe(false)
    expect(ops.deleted).toBe(false)
  })

  it('fails closed when availability cannot be checked', async () => {
    findBlockedSlots.mockRejectedValue(new Error('down'))
    const ops = setup([])
    const res = await createAdminBooking({ name: 'Ann', date: DATE, timeSlots: ['10:00'] })
    expect(res).toEqual({ success: false, error: 'Availability is unavailable right now. Please try again in a moment.' })
    expect(ops.inserted).toHaveLength(0)
  })

  it('approveRescheduleRequest rejects new slots that are now blocked', async () => {
    findBlockedSlots.mockResolvedValue([{ slot: '12:00', source: 'rule', label: 'Tournament' }])
    const ops = setup([existingRow({ is_manual: false })], {
      reschedule_requests: {
        id: 'r1', status: 'pending', booking_group_id: 'g1', new_date: '2026-12-05', new_time_slots: ['12:00'],
        original_date: DATE, original_time_slots: ['10:00'], customer_email: 'a@b.c', customer_name: 'Ann',
      },
    })
    const res = await approveRescheduleRequest('r1')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/12:00 \(Tournament\)/)
    expect(ops.deleted).toBe(false)
  })

  it('createRescheduleRequest rejects a blocked new slot', async () => {
    findBlockedSlots.mockResolvedValue([{ slot: '12:00', source: 'rule', label: 'Tournament' }])
    setup([existingRow({ is_manual: false, user_id: 'u1' })])
    const res = await createRescheduleRequest('g1', null, 'u1', '2026-12-05', ['12:00'])
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/12:00 \(Tournament\)/)
  })
})
```

Add `createRescheduleRequest` to that file's `import { … } from './bookingService'` line. `createRescheduleRequest` uses `.or()`, `.limit()`, `.gte()` and `.lte()`, so extend the `setup()` stub's chain list to `for (const m of ['select', 'eq', 'in', 'order', 'update', 'or', 'limit', 'gte', 'lte']) q[m] = vi.fn(() => q)` (non-`bookings` tables already resolve to `[]`).

- [ ] **Step 4: Run and confirm the new tests fail**

Run: `npm test`
Expected: the 9 new tests FAIL; all others PASS.

- [ ] **Step 5: Enforce in `submitPaymentAction`**

In `src/actions/payment.ts`:
- add `import { findBlockedSlots, SLOTS_UNAVAILABLE, AVAILABILITY_UNAVAILABLE } from '@/lib/slotAvailability'`;
- directly after the existing closed-date block (`if (isClosed) { … }`), insert:

```ts
  // Rules, one-day blocks and closed dates are enforced here too (not just in the UI)
  try {
    const blocked = await findBlockedSlots(parsed.data.date, parsed.data.timeSlots)
    if (blocked.length > 0) return { success: false, error: SLOTS_UNAVAILABLE }
  } catch (error) {
    console.error('Availability check failed:', error)
    return { success: false, error: AVAILABILITY_UNAVAILABLE }
  }
```

- [ ] **Step 6: Enforce in `bookingService.ts`**

Add the import near the other `./` imports:

```ts
import { findBlockedSlots, blocksForAdmin, describeBlocked, SLOTS_UNAVAILABLE, AVAILABILITY_UNAVAILABLE } from './slotAvailability'
```

Add this helper just above `createAdminBooking` (next to `loadPricing`):

```ts
/**
 * Error message if any slot can't be booked, or null. Admins may override rules and one-day blocks
 * (never closed dates). Fails closed when availability can't be read.
 */
async function checkSlotsBookable(date: string, slots: string[], overrideBlocks = false): Promise<string | null> {
  try {
    const blocked = blocksForAdmin(await findBlockedSlots(date, slots), overrideBlocks)
    return blocked.length > 0 ? `${SLOTS_UNAVAILABLE} Blocked: ${describeBlocked(blocked)}.` : null
  } catch (error) {
    console.error('Availability check failed:', error)
    return AVAILABILITY_UNAVAILABLE
  }
}
```

In `createAdminBooking`, right after the `timeSlots` length check and before `const paddlesCount`:

```ts
  const blockedError = await checkSlotsBookable(payload.date, payload.timeSlots, payload.overrideBlocks ?? false)
  if (blockedError) return { success: false, error: blockedError }
```

In `updateAdminBooking`, right after the existing `if (conflict) { … }` block and before `const paddlesCount`:

```ts
  const blockedError = await checkSlotsBookable(payload.date, payload.timeSlots, payload.overrideBlocks ?? false)
  if (blockedError) return { success: false, error: blockedError }
```

In `createRescheduleRequest`, replace the whole "8. Check disabled slots" block (`const disabledOnNewDate = …` through its `if (disabledConflict) { … }`) with:

```ts
  // 8. Check rules, one-day blocks and closed dates
  const blockedError = await checkSlotsBookable(newDate, newTimeSlots)
  if (blockedError) return { success: false, error: blockedError }
```

In `approveRescheduleRequest`, right after the "3. Verify new slots are still available" `if (conflict) { … }` block and before "4. Replace-group":

```ts
  const blockedError = await checkSlotsBookable(request.new_date, request.new_time_slots)
  if (blockedError) return { success: false, error: blockedError }
```

If `getDisabledSlotsByDate` is now unused inside `bookingService.ts` apart from its own export, keep the export (actions and hooks still use it).

- [ ] **Step 7: Run tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/booking.ts src/actions/payment.ts src/lib/bookingService.ts src/actions/actionGuards.test.ts src/lib/bookingService.pricing.test.ts
git commit -m "feat(slots): enforce blocked slots on every booking path"
```

---

### Task 7: Actions and hooks

**Files:**
- Create: `src/actions/slotRules.ts`
- Create: `src/hooks/useSlotRules.ts`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/actions/actionGuards.test.ts`:
- add `import * as slotRuleActions from './slotRules'`;
- add a shared input constant near `payload`:

```ts
const ruleInput = { label: null, startDate: '2026-12-01', endDate: null, weekdays: [1], timeSlots: ['07:00-08:00'] }
```

- append to `ADMIN_ACTIONS`:

```ts
  ['listSlotRulesAction', (t) => slotRuleActions.listSlotRulesAction(t)],
  ['createSlotRuleAction', (t) => slotRuleActions.createSlotRuleAction(t, ruleInput)],
  ['updateSlotRuleAction', (t) => slotRuleActions.updateSlotRuleAction(t, 'r1', ruleInput)],
  ['endSlotRuleAction', (t) => slotRuleActions.endSlotRuleAction(t, 'r1')],
  ['deleteSlotRuleAction', (t) => slotRuleActions.deleteSlotRuleAction(t, 'r1')],
  ['previewSlotRuleOverlapAction', (t) => slotRuleActions.previewSlotRuleOverlapAction(t, ruleInput)],
```

- append a describe at the end of the file:

```ts
describe('slot rule actions', () => {
  beforeEach(() => vi.resetAllMocks())

  const rule = {
    id: 'r1', label: null, start_date: '2026-12-01', end_date: null, weekdays: [1], time_slots: ['07:00-08:00'],
    created_by: 'admin-1', created_at: 'x', updated_at: 'x',
  }
  const asAdmin = () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
  }

  it('the public list hides who created each rule', async () => {
    vi.mocked(slotRulesService.listCurrentSlotRules).mockResolvedValue([rule])
    const res = await slotRuleActions.getCurrentSlotRulesAction()
    expect(res).toEqual({ success: true, rules: [{ ...rule, created_by: null }] })
  })

  it('the public list reports unavailability instead of throwing', async () => {
    vi.mocked(slotRulesService.listCurrentSlotRules).mockRejectedValue(new Error('down'))
    const res = await slotRuleActions.getCurrentSlotRulesAction()
    expect(res.success).toBe(false)
  })

  it('create records the admin as creator', async () => {
    asAdmin()
    vi.mocked(slotRulesService.createSlotRule).mockResolvedValue({ success: true, rule })
    await slotRuleActions.createSlotRuleAction('tok', ruleInput)
    expect(slotRulesService.createSlotRule).toHaveBeenCalledWith(ruleInput, 'admin-1')
  })

  it('preview validates input before querying', async () => {
    asAdmin()
    const res = await slotRuleActions.previewSlotRuleOverlapAction('tok', { ...ruleInput, weekdays: [] })
    expect(res).toEqual({ success: false, error: 'Pick at least one day' })
    expect(slotRulesService.findBookingsOverlappingRule).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/actions/actionGuards.test.ts`
Expected: FAIL (`./slotRules` missing).

- [ ] **Step 3: Implement the actions**

`src/actions/slotRules.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import {
  listSlotRules,
  listCurrentSlotRules,
  createSlotRule,
  updateSlotRule,
  endSlotRule,
  deleteSlotRule,
  findBookingsOverlappingRule,
  type SlotRuleResult,
  type EndSlotRuleResult,
} from '@/lib/slotRulesService'
import { slotRuleInputSchema } from '@/lib/slotRulesSchema'
import { manilaNow } from '@/lib/agent/dates'
import type { SlotRule, RuleOverlapBooking } from '@/types/slotRules'

const UNAVAILABLE = 'Availability is unavailable right now. Please try again in a moment.'

export type SlotRulesListResult = { success: true; rules: SlotRule[] } | { success: false; error: string }
export type SlotRuleOverlapResult = { success: true; bookings: RuleOverlapBooking[] } | { success: false; error: string }

function refresh() {
  revalidatePath('/')
  revalidatePath('/admin')
}

/** Active and upcoming rules (public: drives slot availability on customer screens). */
export async function getCurrentSlotRulesAction(): Promise<SlotRulesListResult> {
  try {
    const rules = await listCurrentSlotRules(manilaNow().date)
    return { success: true, rules: rules.map((r) => ({ ...r, created_by: null })) }
  } catch (error) {
    console.error('Failed to load slot rules:', error)
    return { success: false, error: UNAVAILABLE }
  }
}

/** Every rule, including ended ones (admin). */
export async function listSlotRulesAction(accessToken: string): Promise<SlotRulesListResult> {
  await requireAdmin(accessToken)
  try {
    return { success: true, rules: await listSlotRules() }
  } catch {
    return { success: false, error: UNAVAILABLE }
  }
}

export async function createSlotRuleAction(accessToken: string, input: unknown): Promise<SlotRuleResult> {
  const adminId = await requireAdmin(accessToken)
  const result = await createSlotRule(input, adminId)
  if (result.success) refresh()
  return result
}

export async function updateSlotRuleAction(accessToken: string, id: string, input: unknown): Promise<SlotRuleResult> {
  await requireAdmin(accessToken)
  const result = await updateSlotRule(id, input)
  if (result.success) refresh()
  return result
}

export async function endSlotRuleAction(accessToken: string, id: string): Promise<EndSlotRuleResult> {
  await requireAdmin(accessToken)
  const result = await endSlotRule(id)
  if (result.success) refresh()
  return result
}

export async function deleteSlotRuleAction(accessToken: string, id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await deleteSlotRule(id)
  if (result.success) refresh()
  return result
}

/** Existing bookings a rule would cover (shown before saving). */
export async function previewSlotRuleOverlapAction(accessToken: string, input: unknown): Promise<SlotRuleOverlapResult> {
  await requireAdmin(accessToken)
  const parsed = slotRuleInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid rule' }
  try {
    return { success: true, bookings: await findBookingsOverlappingRule(parsed.data) }
  } catch {
    return { success: false, error: UNAVAILABLE }
  }
}
```

- [ ] **Step 4: Implement the hooks**

`src/hooks/useSlotRules.ts`:

```ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCurrentSlotRulesAction,
  listSlotRulesAction,
  createSlotRuleAction,
  updateSlotRuleAction,
  endSlotRuleAction,
  deleteSlotRuleAction,
  previewSlotRuleOverlapAction,
} from '@/actions/slotRules'
import { getAccessToken } from '@/lib/accessToken'
import type { SlotRule, SlotRuleInput } from '@/types/slotRules'

export const SLOT_RULES_QUERY_KEY = ['slotRules'] as const
const ADMIN_SLOT_RULES_KEY = ['slotRules', 'admin'] as const

/** Active + upcoming rules for customer screens. Throws (isError) when they can't be loaded: callers fail closed. */
export function useSlotRules() {
  return useQuery<SlotRule[]>({
    queryKey: SLOT_RULES_QUERY_KEY,
    queryFn: async () => {
      const result = await getCurrentSlotRulesAction()
      if (!result.success) throw new Error(result.error)
      return result.rules
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

/** Every rule, including ended ones (admin Time Slots tab). */
export function useAdminSlotRules() {
  return useQuery<SlotRule[]>({
    queryKey: ADMIN_SLOT_RULES_KEY,
    queryFn: async () => {
      const result = await listSlotRulesAction(await getAccessToken())
      if (!result.success) throw new Error(result.error)
      return result.rules
    },
    staleTime: 30 * 1000,
  })
}

function useInvalidateRules() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: SLOT_RULES_QUERY_KEY })
}

export function useCreateSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (input: SlotRuleInput) => createSlotRuleAction(await getAccessToken(), input),
    onSuccess: invalidate,
  })
}

export function useUpdateSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SlotRuleInput }) => updateSlotRuleAction(await getAccessToken(), id, input),
    onSuccess: invalidate,
  })
}

export function useEndSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (id: string) => endSlotRuleAction(await getAccessToken(), id),
    onSuccess: invalidate,
  })
}

export function useDeleteSlotRule() {
  const invalidate = useInvalidateRules()
  return useMutation({
    mutationFn: async (id: string) => deleteSlotRuleAction(await getAccessToken(), id),
    onSuccess: invalidate,
  })
}

/** On-demand overlap check for the save review. */
export function usePreviewSlotRuleOverlap() {
  return useMutation({
    mutationFn: async (input: SlotRuleInput) => previewSlotRuleOverlapAction(await getAccessToken(), input),
  })
}
```

- [ ] **Step 5: Run tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/actions/slotRules.ts src/hooks/useSlotRules.ts src/actions/actionGuards.test.ts
git commit -m "feat(slots): add slot rule actions and hooks"
```

---

### Task 8: Slot display shows rule blocks (and fails closed)

**Files:**
- Modify: `src/types/booking.ts` (`TimeSlot`)
- Modify: `src/lib/timeSlotGenerator.ts`
- Create: `src/lib/timeSlotGenerator.test.ts`
- Modify: `src/components/booking/TimeSlotPicker.tsx`
- Modify: `src/components/home/BookSection.tsx`, `src/app/page.tsx`
- Modify: `src/components/profile/RescheduleModal.tsx`
- Modify: `src/app/admin/ui/TodaySummary.tsx`

- [ ] **Step 1: Extend `TimeSlot`**

In `src/types/booking.ts`:

```ts
export interface TimeSlot {
  time: string
  available: boolean
  reason?: 'past' | 'booked' | 'disabled' | 'rule'
  /** For reason 'rule': the rule's label ("Blocked" when the rule has none). */
  label?: string
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/timeSlotGenerator.test.ts`:

```ts
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
    expect(getAvailableSlotsForCourt(booked, DATE, 1, [], { rules: [rule] })[2].reason).toBe('booked')
    const disabled = [{ id: 'd', date: DATE, time_slot: '07:00-08:00', created_at: '' }]
    expect(getAvailableSlotsForCourt([], DATE, 1, disabled, { rules: [rule] })[2].reason).toBe('disabled')
  })

  it('keeps legacy calls working', () => {
    expect(getAvailableSlotsForCourt([], DATE, 1, [], true).every((s) => s.available)).toBe(true)
  })
})
```

(Index 2 is `07:00-08:00` because slots start at `05:00-06:00`.)

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run src/lib/timeSlotGenerator.test.ts`
Expected: FAIL (no `rule` reason).

- [ ] **Step 4: Implement in `timeSlotGenerator.ts`**

- Add imports:

```ts
import { findBlockingRule, ruleLabel } from './slotRules'
import type { SlotRuleLike } from '@/types/slotRules'
```

- Add to `SlotAvailabilityOptions`:

```ts
  /** Slot rules (active/upcoming). Rule-blocked slots get reason 'rule' and the rule's label. */
  rules?: SlotRuleLike[]
```

- After `const heldSlots = opts.heldSlots ?? []` add `const rules = opts.rules ?? []`.
- Replace the `reason` computation and return inside `allSlots.map(...)` with:

```ts
    let reason: TimeSlot['reason']
    let label: string | undefined
    if (isPastOrTooSoon) reason = 'past'
    else if (bookedSlots.includes(slot) || heldSlots.includes(slot)) reason = 'booked'
    else if (disabledTimeSlots.includes(slot)) reason = 'disabled'
    else {
      const rule = findBlockingRule(rules, date, slot)
      if (rule) {
        reason = 'rule'
        label = ruleLabel(rule)
      }
    }

    return {
      time: slot,
      available: !reason,
      reason,
      label,
    }
```

Run: `npx vitest run src/lib/timeSlotGenerator.test.ts && npm test`
Expected: PASS. If `src/lib/agent/summaries.test.ts` compares whole slot objects, update its expectations to include `label: undefined` only if it fails.

- [ ] **Step 5: `TimeSlotPicker` shows labels and a load-error state**

In `src/components/booking/TimeSlotPicker.tsx`:
- add `loadError?: string | null` to `TimeSlotPickerProps` and destructure `loadError = null`;
- right after the `if (isLoading) { … }` block add:

```tsx
  if (loadError) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-700 font-medium">{loadError}</p>
      </div>
    )
  }
```

- in the unavailable branch, keep `past` and `booked` as they are and give `rule` slots the existing grey "ban" style plus room for the label: replace the final `else { … }` with:

```tsx
                } else {
                  unavailableClass = `bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200${slot.reason === 'rule' ? ' h-auto min-h-11 py-1' : ''}`
                  icon = <Ban className="w-3.5 h-3.5 shrink-0" />
                }
```

- replace the button content (`{icon ? ( … ) : slot.time}`) with:

```tsx
                  {icon ? (
                    <span className="flex flex-col items-center leading-tight">
                      <span className="flex items-center justify-center gap-1.5">
                        {icon}
                        {slot.time}
                      </span>
                      {slot.reason === 'rule' && slot.label && (
                        <span className="text-[11px] font-normal text-gray-500">{slot.label}</span>
                      )}
                    </span>
                  ) : slot.time}
```

- [ ] **Step 6: Booking page passes rules and fails closed**

In `src/app/page.tsx`:
- add `import { useSlotRules } from '@/hooks/useSlotRules'`;
- below `useClosedDates()` add:

```ts
  const { data: slotRules, isLoading: rulesLoading, isError: rulesError } = useSlotRules()
```

- change `availableSlots`:

```ts
  const availableSlots = useMemo(() => {
    return getAvailableSlotsForCourt(bookings, dateString, 1, disabledSlots, { rules: slotRules ?? [] })
  }, [bookings, dateString, disabledSlots, slotRules])
```

- in `<BookSection … />`: change `isLoading={isLoading}` to `isLoading={isLoading || rulesLoading}` and add `availabilityError={rulesError ? 'Availability unavailable, please try again' : null}`.

In `src/components/home/BookSection.tsx`:
- add `availabilityError: string | null` to the props interface and destructure it;
- pass `loadError={availabilityError}` to `<TimeSlotPicker … />`;
- change `{selectedSlots.length > 0 && !isDateClosed && (` to `{selectedSlots.length > 0 && !isDateClosed && !availabilityError && (`.

- [ ] **Step 7: Reschedule modal passes rules and fails closed**

In `src/components/profile/RescheduleModal.tsx`:
- add `import { useSlotRules } from '@/hooks/useSlotRules'`;
- add `const { data: slotRules, isLoading: rulesLoading, isError: rulesError } = useSlotRules()` next to the other queries;
- add `rules: slotRules ?? [],` to the options object passed to `getAvailableSlotsForCourt` and `slotRules` to its `useMemo` deps;
- change `const isLoadingSlots = bookingsLoading || slotsLoading || heldLoading` to include `|| rulesLoading`;
- pass `loadError={rulesError ? 'Availability unavailable, please try again' : null}` to its `<TimeSlotPicker … />`;
- make the modal's submit button `disabled` also when `rulesError` is true (find the existing `disabled={…}` on the submit button and add `|| rulesError`).

- [ ] **Step 8: Today summary counts rule-blocked slots**

In `src/app/admin/ui/TodaySummary.tsx`:
- add `import { useSlotRules } from '@/hooks/useSlotRules'` and `import { findBlockingRule } from '@/lib/slotRules'`;
- below `useDisabledSlotsByDate(todayStr)` add `const { data: slotRules = [] } = useSlotRules()`;
- replace `const disabledSet = new Set(disabledToday.map(d => d.time_slot))` with:

```ts
    const disabledSet = new Set([
      ...disabledToday.map(d => d.time_slot),
      ...generateTimeSlots().filter(s => findBlockingRule(slotRules, todayStr, s)),
    ])
```

- [ ] **Step 9: Verify and commit**

Run: `npm test && npx tsc --noEmit && npx eslint src/components/booking/TimeSlotPicker.tsx src/components/home/BookSection.tsx src/app/page.tsx src/components/profile/RescheduleModal.tsx src/app/admin/ui/TodaySummary.tsx src/lib/timeSlotGenerator.ts`
Expected: PASS; no new lint errors (pre-existing ones in untouched lines may remain; note them).

```bash
git add src/types/booking.ts src/lib/timeSlotGenerator.ts src/lib/timeSlotGenerator.test.ts src/components/booking/TimeSlotPicker.tsx src/components/home/BookSection.tsx src/app/page.tsx src/components/profile/RescheduleModal.tsx src/app/admin/ui/TodaySummary.tsx
git commit -m "feat(slots): show rule-blocked slots with labels; fail closed without rules"
```

---

### Task 9: Admin booking form shows blocks and asks before overriding

**Files:**
- Modify: `src/components/admin/AdminBookingForm.tsx`

- [ ] **Step 1: Load rules and compute slots with them**

- Add imports:

```ts
import { useSlotRules } from '@/hooks/useSlotRules'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
```

(Check the real export name/path of `ConfirmationDialog` with `grep -n "export" src/components/ui/ConfirmationDialog.tsx` and match it.)

- After `useClosedDates()` add:

```ts
  const { data: slotRules = [], isError: rulesError } = useSlotRules()
  const [confirmOverride, setConfirmOverride] = useState(false)
```

- Change the `availableSlots` memo's call to use options and rules:

```ts
    return getAvailableSlotsForCourt(others, date, COURT_NUMBER, disabledSlots, { ignorePast: true, bufferMinutes: 0, rules: slotRules })
  }, [activeBookings, disabledSlots, date, initialValues, slotRules])
```

- Below the memo add:

```ts
  // Admins may book slots blocked by a rule or a one-day block, after confirming
  const isOverridable = (reason?: string) => reason === 'rule' || reason === 'disabled'
  const blockedSelected = availableSlots.filter((s) => selectedSlots.includes(s.time) && isOverridable(s.reason))
```

- [ ] **Step 2: Let admins select blocked (not booked) slots and show labels**

In the time-slot grid, replace the `const disabled = …` line and the `onClick` with:

```tsx
                const blocked = isOverridable(slot.reason)
                const disabled = !slot.available && !blocked && !isSelected
```

```tsx
                    onClick={() => (slot.available || blocked || isSelected) && toggleSlot(slot.time)}
```

Then in the button's className, add an amber style for blocked slots (before the existing `isSelected` branch):

```tsx
                      disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : blocked && !isSelected
                          ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:border-amber-400'
                          : isSelected
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
```

and replace the button text `{slot.time}` with:

```tsx
                    <span className="flex flex-col items-center leading-tight">
                      {slot.time}
                      {blocked && <span className="text-[11px] font-normal">{slot.label ?? 'Blocked'}</span>}
                    </span>
```

Below the grid's "N slots selected" paragraph add:

```tsx
            {rulesError && (
              <p className="text-xs text-amber-600">Couldn&apos;t load slot rules. The server still checks blocks when you save.</p>
            )}
```

- [ ] **Step 3: Confirm before booking blocked slots**

Split `handleSave` into a validation step and a save step:

```ts
  const save = async (overrideBlocks: boolean) => {
    const payload = { name: name.trim(), date, timeSlots: selectedSlots, paddles, needsBalls, trainingBalls, overrideBlocks }
    try {
      const result = initialValues
        ? await updateBooking.mutateAsync({ bookingGroupId: initialValues.bookingGroupId, payload })
        : await createBooking.mutateAsync(payload)

      if (result.success) {
        const saved = result.bookings?.[0]?.payment_amount
        const amountText = typeof saved === 'number' ? ` (₱${saved.toLocaleString('en-US')})` : ''
        toast.success(`${isEdit ? 'Booking updated' : 'Booking created'}${amountText}`)
        onClose()
      } else {
        toast.error(result.error || 'Failed to save booking')
      }
    } catch {
      toast.error('Failed to save booking')
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter the player name')
      return
    }
    if (selectedSlots.length === 0) {
      toast.error('Please select at least one time slot')
      return
    }
    if (isDateClosed) {
      toast.error('The court is closed on this date')
      return
    }
    if (blockedSelected.length > 0) {
      setConfirmOverride(true)
      return
    }
    await save(false)
  }
```

(This replaces the old `handleSave` body; the `payload`/`try` block moves into `save`.)

At the end of the component's outer `<div>` (just before its closing tag), add:

```tsx
      <ConfirmationDialog
        open={confirmOverride}
        onClose={() => setConfirmOverride(false)}
        onConfirm={async () => {
          setConfirmOverride(false)
          await save(true)
        }}
        title="Book blocked slots?"
        description="These slots are blocked for customers. Book them anyway for this player?"
        confirmText="Book anyway"
        variant="warning"
        isLoading={isSubmitting}
      >
        <ul className="text-sm text-gray-700 space-y-1">
          {blockedSelected.map((s) => (
            <li key={s.time}>
              {s.time} — {s.label ?? 'Blocked'}
            </li>
          ))}
        </ul>
      </ConfirmationDialog>
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npx eslint src/components/admin/AdminBookingForm.tsx && npm test`
Expected: PASS.

```bash
git add src/components/admin/AdminBookingForm.tsx
git commit -m "feat(slots): admin booking form shows blocks and confirms overrides"
```

---

### Task 10: Admin rules UI in the Time Slots tab

**Files:**
- Create: `src/components/admin/SlotRuleForm.tsx`
- Create: `src/components/admin/SlotRulesSection.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Rule form**

`src/components/admin/SlotRuleForm.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { generateTimeSlots } from '@/lib/timeSlotGenerator'
import { slotRuleInputSchema, MAX_RULE_LABEL } from '@/lib/slotRulesSchema'
import { describeRule, WEEKDAY_SHORT } from '@/lib/slotRules'
import { formatHour } from '@/lib/pricing'
import { manilaNow } from '@/lib/agent/dates'
import { useCreateSlotRule, useUpdateSlotRule, usePreviewSlotRuleOverlap } from '@/hooks/useSlotRules'
import type { SlotRule, SlotRuleInput, RuleOverlapBooking } from '@/types/slotRules'

const SLOTS = generateTimeSlots()
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
const DAY_SHORTCUTS: { label: string; days: number[] }[] = [
  { label: 'Every day', days: ALL_DAYS },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [6, 7] },
]

const slotLabel = (slot: string) => {
  const h = Number(slot.slice(0, 2))
  return `${formatHour(h)} - ${formatHour(h + 1)}`
}

interface Props {
  /** Edit this rule; omit to create a new one. */
  initial?: SlotRule | null
  onClose: () => void
}

export function SlotRuleForm({ initial, onClose }: Props) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? manilaNow().date)
  const [noEnd, setNoEnd] = useState(initial ? initial.end_date === null : true)
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? ALL_DAYS)
  const [timeSlots, setTimeSlots] = useState<string[]>(initial?.time_slots ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [review, setReview] = useState<{ input: SlotRuleInput; overlaps: RuleOverlapBooking[] } | null>(null)

  const createRule = useCreateSlotRule()
  const updateRule = useUpdateSlotRule()
  const preview = usePreviewSlotRuleOverlap()
  const saving = createRule.isPending || updateRule.isPending
  const inFlight = useRef(false)

  // Drag-select across the slot grid (mouse and touch)
  const drag = useRef<{ adding: boolean } | null>(null)
  useEffect(() => {
    const stop = () => { drag.current = null }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])
  const applySlot = (slot: string, adding: boolean) =>
    setTimeSlots((prev) => (adding ? (prev.includes(slot) ? prev : [...prev, slot]) : prev.filter((s) => s !== slot)))
  const slotAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-slot]')?.dataset.slot

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const currentInput = (): SlotRuleInput => ({
    label: label.trim() ? label.trim() : null,
    startDate,
    endDate: noEnd ? null : endDate,
    weekdays,
    timeSlots,
  })

  const onReview = async () => {
    const parsed = slotRuleInputSchema.safeParse(currentInput())
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    const result = await preview.mutateAsync(parsed.data).catch(() => null)
    if (!result || !result.success) {
      toast.error(result?.error ?? 'Could not check existing bookings')
      return
    }
    setReview({ input: parsed.data, overlaps: result.bookings })
  }

  const onConfirm = async () => {
    if (!review || inFlight.current) return
    inFlight.current = true
    try {
      const result = initial
        ? await updateRule.mutateAsync({ id: initial.id, input: review.input })
        : await createRule.mutateAsync(review.input)
      if (result.success) {
        toast.success(initial ? 'Rule updated' : 'Rule saved')
        onClose()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Failed to save the rule')
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{initial ? 'Edit rule' : 'New rule'}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rule-label">Label (optional)</Label>
        <Input
          id="rule-label"
          placeholder="e.g. Open Play. Leave empty to show “Blocked”."
          maxLength={MAX_RULE_LABEL}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {errors.label && <p className="text-sm text-red-600">{errors.label}</p>}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Days</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_SHORTCUTS.map((s) => (
            <Button key={s.label} type="button" variant="outline" size="sm" onClick={() => setWeekdays(s.days)}>
              {s.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_SHORT.map((name, i) => {
            const d = i + 1
            const on = weekdays.includes(d)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${on ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600'}`}
              >
                {name}
              </button>
            )
          })}
        </div>
        {errors.weekdays && <p className="text-sm text-red-600">{errors.weekdays}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Time slots (tap or drag to select)</legend>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-2 touch-none select-none"
          onPointerMove={(e) => {
            if (!drag.current) return
            const slot = slotAt(e.clientX, e.clientY)
            if (slot) applySlot(slot, drag.current.adding)
          }}
        >
          {SLOTS.map((slot) => {
            const on = timeSlots.includes(slot)
            return (
              <button
                key={slot}
                type="button"
                data-slot={slot}
                aria-pressed={on}
                onPointerDown={(e) => {
                  e.preventDefault()
                  drag.current = { adding: !on }
                  applySlot(slot, !on)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    applySlot(slot, !on)
                  }
                }}
                className={`p-2 rounded-lg text-sm font-medium border ${on ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-700'}`}
              >
                {slotLabel(slot)}
              </button>
            )
          })}
        </div>
        <div className="flex gap-3 text-sm">
          <button type="button" className="text-emerald-700 hover:underline" onClick={() => setTimeSlots(SLOTS)}>Select all</button>
          <button type="button" className="text-gray-600 hover:underline" onClick={() => setTimeSlots([])}>Clear</button>
        </div>
        {errors.timeSlots && <p className="text-sm text-red-600">{errors.timeSlots}</p>}
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rule-start">Start date</Label>
          <input
            id="rule-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
          />
          {errors.startDate && <p className="text-sm text-red-600">{errors.startDate}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-end">End date</Label>
          <input
            id="rule-end"
            type="date"
            value={endDate}
            min={startDate}
            disabled={noEnd}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 disabled:opacity-50"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
            No end date
          </label>
          {errors.endDate && <p className="text-sm text-red-600">{errors.endDate}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={onReview} disabled={preview.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {preview.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Review'}
        </Button>
      </div>

      <ConfirmationDialog
        open={!!review}
        onClose={() => setReview(null)}
        onConfirm={onConfirm}
        title={initial ? 'Save changes to this rule?' : 'Save this rule?'}
        description={review ? describeRule({
          label: review.input.label,
          start_date: review.input.startDate,
          end_date: review.input.endDate,
          weekdays: review.input.weekdays,
          time_slots: review.input.timeSlots,
        }) : ''}
        confirmText={initial ? 'Save changes' : 'Save rule'}
        variant={review && review.overlaps.length > 0 ? 'warning' : 'confirm'}
        isLoading={saving}
      >
        {review && review.overlaps.length > 0 && (
          <div className="text-sm text-gray-700 space-y-2">
            <p className="font-medium text-amber-800">
              {review.overlaps.length} existing booking{review.overlaps.length > 1 ? 's' : ''} fall in these slots. They stay booked; contact them if needed.
            </p>
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {review.overlaps.map((b) => (
                <li key={`${b.shortId}-${b.date}-${b.timeSlot}`}>
                  {b.shortId ?? '—'} · {b.date} · {b.timeSlot} · {b.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </ConfirmationDialog>
    </div>
  )
}
```

Check `ConfirmationDialog`'s real variant names (`confirm | reject | warning | danger` per its config) and import style; match them.

- [ ] **Step 2: Rules section**

`src/components/admin/SlotRulesSection.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { Plus, Pencil, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { SlotRuleForm } from './SlotRuleForm'
import { useAdminSlotRules, useEndSlotRule, useDeleteSlotRule } from '@/hooks/useSlotRules'
import { describeRuleDates, describeTimeSlots, describeWeekdays, ruleLabel, ruleStatus } from '@/lib/slotRules'
import { manilaNow } from '@/lib/agent/dates'
import type { SlotRule } from '@/types/slotRules'

const STATUS_STYLE = {
  active: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-blue-100 text-blue-800',
  ended: 'bg-gray-100 text-gray-600',
} as const

export function SlotRulesSection() {
  const { data: rules = [], isLoading, isError, refetch } = useAdminSlotRules()
  const endRule = useEndSlotRule()
  const deleteRule = useDeleteSlotRule()
  const [editing, setEditing] = useState<SlotRule | 'new' | null>(null)
  const [pending, setPending] = useState<{ action: 'end' | 'delete'; rule: SlotRule } | null>(null)
  const inFlight = useRef(false)
  const today = manilaNow().date

  const onConfirm = async () => {
    if (!pending || inFlight.current) return
    inFlight.current = true
    try {
      const result = pending.action === 'end' ? await endRule.mutateAsync(pending.rule.id) : await deleteRule.mutateAsync(pending.rule.id)
      if (result.success) {
        toast.success(pending.action === 'end' ? ('deleted' in result && result.deleted ? 'Rule removed (it had not started)' : 'Rule ended') : 'Rule deleted')
        setPending(null)
      } else {
        toast.error(result.error ?? 'Something went wrong')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      inFlight.current = false
    }
  }

  if (editing) {
    return <SlotRuleForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Slot rules</h3>
          <p className="text-sm text-gray-500">Block slots on a schedule (open play, tournaments, opening hours).</p>
        </div>
        <Button onClick={() => setEditing('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
          <Plus className="w-4 h-4 mr-1" /> New rule
        </Button>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-center py-6">Loading rules…</p>
      ) : isError ? (
        <div className="text-center py-6 space-y-2">
          <p className="text-gray-700">Couldn&apos;t load slot rules.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : rules.length === 0 ? (
        <p className="text-gray-500 text-center py-6">No rules yet.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const status = ruleStatus(rule, today)
            return (
              <li key={rule.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {ruleLabel(rule)}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[status]}`}>
                      {status === 'active' ? 'Active' : status === 'upcoming' ? 'Upcoming' : 'Ended'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    {describeTimeSlots(rule.time_slots)} · {describeWeekdays(rule.weekdays)} · {describeRuleDates(rule)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(rule)} aria-label="Edit rule">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {status !== 'ended' && (
                    <Button variant="ghost" size="sm" onClick={() => setPending({ action: 'end', rule })} aria-label="End rule">
                      <Square className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setPending({ action: 'delete', rule })} aria-label="Delete rule" className="text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmationDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={onConfirm}
        title={pending?.action === 'end' ? 'End this rule?' : 'Delete this rule?'}
        description={
          pending?.action === 'end'
            ? 'Slots open up again from today. The rule stays in the list as ended.'
            : 'The rule is removed completely and its slots open up again.'
        }
        confirmText={pending?.action === 'end' ? 'End rule' : 'Delete rule'}
        variant="danger"
        isLoading={endRule.isPending || deleteRule.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 3: Mount it in the Time Slots tab**

In `src/app/admin/page.tsx`:
- add `import { SlotRulesSection } from '@/components/admin/SlotRulesSection'`;
- wrap the Time Slots tab content so the rules section sits above the existing grid:

```tsx
          {table.activeTab === 'slots' && (
            <div className="space-y-6">
              <SlotRulesSection />
              <div className="grid md:grid-cols-2 gap-6">
                {/* existing "Disable Time Slots" and "Currently Disabled Slots" cards, unchanged */}
              </div>
            </div>
          )}
```

(Move the existing two cards inside the inner grid unchanged; rename the left card's heading from "Disable Time Slots" to "Block a single date" so its role is clear next to rules.)

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npx eslint src/components/admin/SlotRuleForm.tsx src/components/admin/SlotRulesSection.tsx src/app/admin/page.tsx && npm test && env -u ANTHROPIC_API_KEY npm run build`
Expected: PASS (the 2 pre-existing `no-explicit-any` errors in `src/app/admin/page.tsx` lines may remain; no new ones).

```bash
git add src/components/admin/SlotRuleForm.tsx src/components/admin/SlotRulesSection.tsx src/app/admin/page.tsx
git commit -m "feat(slots): admin slot rules section in the Time Slots tab"
```

---

### Task 11: Assistant reports rule blocks

**Files:**
- Modify: `src/lib/agent/summaries.ts`
- Modify: `src/lib/agent/tools.ts`
- Modify: `src/lib/agent/summaries.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/agent/summaries.test.ts`, inside `describe('summarizeAvailability', …)`, add:

```ts
  it('reports slots blocked by a rule with its label', () => {
    const rule = { label: 'Open Play', start_date: '2026-10-01', end_date: null, weekdays: [1, 2, 3, 4, 5, 6, 7], time_slots: ['07:00-08:00'] }
    const result = summarizeAvailability('2026-10-20', [], [], [], [rule], FUTURE)
    expect(result.blockedByRule).toEqual([{ time: '07:00-08:00', label: 'Open Play' }])
    expect(result.available).not.toContain('07:00-08:00')
  })
```

Then update every existing `summarizeAvailability(…, FUTURE)` call in that file to pass `[]` for rules before `FUTURE` (find them with `grep -n "summarizeAvailability(" src/lib/agent/summaries.test.ts`).

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/agent/summaries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/agent/summaries.ts`, add `import type { SlotRuleLike } from '@/types/slotRules'` and change `summarizeAvailability`:

```ts
/** `activeBookings` = pending + confirmed rows for `date` (what blocks a slot). */
export function summarizeAvailability(
  date: string,
  activeBookings: Booking[],
  disabledSlots: DisabledSlot[],
  closedDates: ClosedDate[],
  slotRules: SlotRuleLike[] = [],
  now: Date = new Date()
) {
  const closed = closedDates.find(c => c.start_date <= date && date <= c.end_date)
  const slots = getAvailableSlotsForCourt(activeBookings, date, 1, disabledSlots, { ignorePast: true, rules: slotRules })
  const { date: today, time } = manilaNow(now)
  const nowHour = Number(time.slice(0, 2))
  const isPast = (slot: string) =>
    date < today || (date === today && Number(slot.slice(0, 2)) <= nowHour)
  return {
    date,
    closed: closed ? { reason: closed.reason } : null,
    available: closed ? [] : slots.filter(s => s.available && !isPast(s.time)).map(s => s.time),
    booked: slots.filter(s => s.reason === 'booked').map(s => s.time),
    disabled: slots.filter(s => s.reason === 'disabled').map(s => s.time),
    blockedByRule: slots.filter(s => s.reason === 'rule').map(s => ({ time: s.time, label: s.label ?? 'Blocked' })),
  }
}
```

(`getAvailableSlotsForCourt` with an object option defaults `bufferMinutes` to 30, but `ignorePast: true` skips the time check entirely, so behaviour is unchanged.)

In `src/lib/agent/tools.ts`, `getSlotAvailability`:
- add `import { getSlotRulesForDate } from '@/lib/slotRulesService'`;
- update the description to: `'Which 1-hour slots on a date are available, booked (pending or confirmed), disabled by an admin for that date, or blocked by a slot rule (with its label), and whether the whole date is closed.'`;
- change the execute body to:

```ts
      const [active, disabled, closed, rules] = await Promise.all([
        getActiveBookingsByDate(date),
        getDisabledSlotsByDate(date),
        getClosedDates(),
        getSlotRulesForDate(date),
      ])
      return summarizeAvailability(date, active, disabled, closed, rules)
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/agent/summaries.ts src/lib/agent/tools.ts src/lib/agent/summaries.test.ts
git commit -m "feat(slots): assistant reports rule-blocked slots"
```

---

### Task 12: Docs and full verification

**Files:**
- Modify: `docs/features/slots-and-closures.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `docs/features/slots-and-closures.md`**

Keep the page's existing skeleton (Key files / How it works / Data / Rules / Gotchas). Add or change:
- **Key files:** `src/lib/slotRules.ts` (pure rule logic: `findBlockingRule`, `ruleLabel`, wording), `src/lib/slotRulesSchema.ts`, `src/lib/slotRulesService.ts` (CRUD, `getSlotRulesForDate`, overlap query; fails closed), `src/lib/slotAvailability.ts` (`findBlockedSlots`, used by every booking write path), `src/actions/slotRules.ts`, `src/hooks/useSlotRules.ts`, `src/components/admin/SlotRulesSection.tsx` + `SlotRuleForm.tsx`.
- **How it works:** a slot is unavailable when booked/held, in `disabled_slots` for that date, the date is in `closed_dates`, or a `slot_rules` row covers it (date in `[start_date, end_date]`, ISO weekday in `weekdays`, slot in `time_slots`). Customer screens show rule blocks with the label ("Blocked" if none) and refuse selection if rules can't load. Server write paths (customer submit, reschedule request + approval, admin create/update) call `findBlockedSlots`; admins may pass `overrideBlocks` (after a confirmation) to book over rules and one-day blocks, never closed dates.
- **Data:** `slot_rules` (`sql/slot-rules-migration.sql`): label (nullable, ≤ 30), start_date, end_date (nullable, inclusive), weekdays smallint[] 1–7, time_slots text[], created_by, timestamps; RLS on, service role only. Query keys `['slotRules']` (customer, active + upcoming) and `['slotRules','admin']`.
- **Rules (don't break):** never check availability only in the UI; every new booking path must call `findBlockedSlots`. Rules carry no money and may be edited; ending a rule sets `end_date` to Manila yesterday (or deletes it if it hadn't started). Hours are still limited to `generateTimeSlots()` (5 AM–12 AM).
- **Gotchas:** remove the old "server doesn't re-check disabled slots" gap note (fixed). Note that existing bookings inside a new rule stay valid (the admin sees them in the save review).

- [ ] **Step 2: Update `CLAUDE.md`**

- In **Database Tables**, add: `` - `slot_rules` — reusable slot blocks (recurring, ranges, opening hours); see `docs/features/slots-and-closures.md` ``.
- In the query-key list, add `` - `['slotRules']` — active + upcoming slot rules (customer availability); `['slotRules','admin']` — all rules ``.
- In **Booking System → Slot availability**, add: "Admin slot rules also block slots; every booking write path re-checks on the server (`lib/slotAvailability.ts`)."

- [ ] **Step 3: Full verification**

Run each and record the summary line:
- `npm test`
- `npx tsc --noEmit`
- `npx eslint` on every file changed in this branch: `git diff --name-only dev...HEAD -- '*.ts' '*.tsx' | xargs npx eslint`
- `env -u ANTHROPIC_API_KEY npm run build`

Expected: tests and build pass; no new lint errors (list any pre-existing ones that remain).

- [ ] **Step 4: Commit**

```bash
git add docs/features/slots-and-closures.md CLAUDE.md
git commit -m "docs: document slot rules"
```

- [ ] **Step 5: Owner checks (local dev server, production database)**

Start: `env -u ANTHROPIC_API_KEY npx next dev -p 3001`. Read-only checks the owner can do freely:
1. `/admin` → Time Slots: the Slot rules section loads (empty list), New rule form opens, weekday shortcuts and drag-select work on desktop and phone width. Reach Review with a rule and press Back (nothing saved).
2. `/` booking page and `/profile` reschedule modal still show slots normally.

Write-path checks need the owner's explicit OK (they change the live site):
3. Create a rule far in the future (e.g. a single weekday in 2028, one slot, label "Test"). Pick that date on `/` → the slot shows greyed with "Test". In admin New Booking pick that slot → "Book anyway" confirmation appears; press Cancel. Then End/Delete the rule and confirm the slot is free again.
4. Optional: an overlap test, i.e. create a rule over a date/slot that already has a booking → the review lists it; press Back without saving.

---

## Self-review notes

- **Spec coverage:** rule model and table (Tasks 1–4), optional label defaulting to "Blocked" (2, 3, 8), server enforcement on customer submit, reschedule request + approval and admin create/update with override (5, 6), customer display with label and fail-closed UI (8), admin override confirmation (9), admin Rules UI with list/edit/end/delete, weekday shortcuts, drag-select and overlap review (10), assistant (11), Today summary (8), docs (12). Overlapping bookings stay valid (no cancellation anywhere).
- **Decisions beyond the spec:**
  - The public list returns only active + upcoming rules (`listCurrentSlotRules`) to keep payloads small. Admins get all rules.
  - "End" deletes a rule that starts today or later (it never applied).
  - The overlap check looks at most 366 days ahead for rules without an end date.
  - The admin override also covers one-day blocks, not just rules, because both are "blocks"; closed dates are never overridable.
  - `isDateClosed` (fails open) stays where it was. `findBlockedSlots` independently fails closed and also checks closed dates.
- **Type consistency:** `SlotRuleLike` is used by `slotRules.ts`, `timeSlotGenerator.ts` and `summaries.ts`. `SlotRuleInput` is the camelCase input for schema, service, actions and hooks. `AvailabilityUnavailableError` lives in `slotRulesService.ts` and is re-used by `slotAvailability.ts`. `AVAILABILITY_UNAVAILABLE` and `SLOTS_UNAVAILABLE` are exported from `slotAvailability.ts` and used by `payment.ts` and `bookingService.ts`.
