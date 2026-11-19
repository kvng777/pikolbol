# Admin Pricing Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can change every price (slot tiers and which hours they cover, extra players, equipment, equipment charge start date, cancellation fee and window) from a new "Pricing" tab, either immediately or scheduled for a future play date, and every screen, saved booking, email, Finance number and the assistant use the right price.

**Architecture:** Prices live in a versioned `pricing_schedules` table; a booking is priced by the newest non-cancelled version whose `effective_from` ≤ its **play date** (Manila). One pure module (`lib/pricing.ts`) does all price math from a `PricingRules` object and runs on client and server. When the payment screen opens, the server issues an HMAC-signed price quote; on "I've Completed Payment" the server verifies it and saves exactly the quoted amount, plus a `pricing_snapshot` (the rules used) on each booking row. Cancellation fees and Finance equipment revenue read the booking's own snapshot, so later price changes never alter past bookings or reports.

**Tech Stack:** Next.js App Router server actions, Supabase (service role), React Query, React Hook Form + Zod v4, Vitest, Node `crypto` HMAC.

**Prerequisite:** Plan 1 (`2026-11-18-server-action-auth.md`) is merged: protected actions take `accessToken` first and call `requireAdmin`/`requireUser` from `@/lib/actionAuth`; hooks get tokens via `getAccessToken()` from `@/lib/accessToken`; `src/actions/actionGuards.test.ts` lists every admin action.

---

## Decisions locked in

| Topic | Decision |
|---|---|
| What's editable | 3 tier prices; tier for each of the 19 hourly slots (05:00…23:00 starts); extra-player charge; players included; paddle, ball set, training balls prices; equipment charge start date (blank = always charged); cancellation fee per slot; **cancellation window hours** (included — it's one number on the same snapshot). |
| Which version applies | By play date: newest non-cancelled row with `effective_from ≤ play date`; ties broken by newest `created_at` (so a same-day correction wins). |
| Immediately vs scheduled | "Apply now" = `effective_from = today (Manila)`. "Schedule" = date ≥ tomorrow. |
| Immutability | Rows are never edited. A version can be cancelled only while `effective_from > today`. |
| Seed | One row effective `2000-01-01` with today's prices → zero behaviour change on deploy. |
| Failure mode | If prices can't be read or a row fails validation: quotes, bookings and admin bookings fail with "Prices are unavailable right now…". Never ₱0, never a silent fallback to constants. The only constant fallback (`SEED_PRICING_RULES`) is for **old booking rows without a snapshot**, whose prices were by definition the seed prices. |
| Honouring the shown amount | Signed quote, valid 60 min, bound to date, sorted slots, players, equipment, amount, version id, expiry. Invalid/expired → `code: 'quote_invalid'`, UI refetches the quote and asks the user to review. |
| Quote secret | New env var `PRICE_QUOTE_SECRET` (≥ 32 chars). Missing/short → quotes and submissions fail closed. Separate from `ADMIN_ACTION_SECRET` so rotating one doesn't affect the other. |
| Snapshot | `bookings.pricing_snapshot jsonb` = `{ version_id, rules }`, written by customer bookings, admin bookings, admin edits and reschedules. |
| Admin edit of manual booking | Keeps stored amount + snapshot unless date, slots or equipment changed; otherwise re-prices with the version for the (new) date. |
| Finance "time of day" bands | `calculateTimeBreakdown` keeps fixed analytics bands (`EVENING_START_HOUR`, `LATE_NIGHT_START_HOUR`). They label revenue, they don't price anything. |
| Assistant | Static cached system prompt has no prices; a per-request "pricing note" (current + upcoming versions) is added after the cache breakpoint. |
| Price history UI | Shows current version + upcoming versions (with Cancel). Older versions stay in the DB but aren't listed (YAGNI). |

## File map

**Create**
- `sql/pricing-schedules-migration.sql` — table, seed row, `bookings.pricing_snapshot`.
- `src/types/pricing.ts` — `RateTier`, `PricingRules`, `PricingVersion`, `PricingSnapshot`, `EquipmentSelection`, `QuoteInput`, `PriceQuote`.
- `src/lib/pricing.ts` (+ `pricing.test.ts`) — pure price math, version picking, tier-hour descriptions, diff for the confirm dialog.
- `src/lib/pricingSchema.ts` (+ `pricingSchema.test.ts`) — Zod schemas shared by server and admin form.
- `src/lib/pricingService.ts` (+ `pricingService.test.ts`) — server reads/writes of `pricing_schedules`.
- `src/lib/priceQuote.ts` (+ `priceQuote.test.ts`) — sign/verify quotes.
- `src/actions/pricing.ts` — public `getPricingVersionsAction`, `getPriceQuoteAction`; admin `createPricingVersionAction`, `cancelPricingVersionAction`.
- `src/hooks/usePricing.ts` — `['pricing']` query, quote query, admin mutations.
- `src/lib/agent/pricingNote.ts` (+ `pricingNote.test.ts`).
- `src/lib/financeUtils.test.ts`.
- `src/components/admin/PricingSettings.tsx` — the tab.

**Modify**
- `src/types/booking.ts` (snapshot field), `src/lib/paymentService.ts`, `src/actions/payment.ts`, `src/hooks/usePayment.ts`, `src/components/booking/PaymentScreen.tsx`, `src/app/page.tsx`
- `src/lib/bookingService.ts` (admin create/update, reschedule copy, cancellation), `src/components/admin/AdminBookingForm.tsx`, `src/app/admin/page.tsx`
- `src/components/profile/BookingHistory.tsx`, `src/lib/financeUtils.ts`
- `src/components/booking/BookingForm.tsx`, `src/components/booking/EquipmentSelector.tsx`, `src/components/home/RatesPolicies.tsx`, `src/components/ui/BookingConfirmedModal.tsx`, `src/app/admin/ui/BookingsTable.tsx`
- `src/lib/agent/prompt.ts`, `src/lib/agent/prompt.test.ts`, `src/app/api/admin/agent/route.ts`
- `src/hooks/useAdminPage.ts` (tab union), `src/actions/actionGuards.test.ts`
- Cleanup: `src/lib/paymentConfig.ts`, delete `src/lib/constants.ts`, `src/lib/__tests__/bookingService.test.ts` import
- `.env.local.example`, `CLAUDE.md`

---

### Task 1: Database migration (owner applies it)

**Files:**
- Create: `sql/pricing-schedules-migration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================
-- Pikolbol Pricing Schedules Migration
-- Run this in your Supabase SQL Editor
-- (Versioned prices. A booking uses the newest non-cancelled row whose
--  effective_from <= its play date. Rows are never edited; upcoming rows can
--  be cancelled. Also stores the prices used on each booking.)
-- =============================================

-- 1. Versioned price table
CREATE TABLE IF NOT EXISTS pricing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from DATE NOT NULL,            -- Play date (Asia/Manila) this version starts applying
  rules JSONB NOT NULL,                    -- PricingRules (validated by the app with Zod)
  created_by UUID,                         -- Admin user id (auth.users.id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ                 -- Set when an upcoming version is cancelled
);

CREATE INDEX IF NOT EXISTS pricing_schedules_active_idx
  ON pricing_schedules (effective_from DESC, created_at DESC)
  WHERE cancelled_at IS NULL;

-- 2. RLS on, no policies: only the service role (server) can read/write
ALTER TABLE pricing_schedules ENABLE ROW LEVEL SECURITY;

-- 3. Seed today's prices so behaviour is unchanged on deploy (only if empty)
INSERT INTO pricing_schedules (effective_from, rules)
SELECT
  DATE '2000-01-01',
  '{
    "tier_prices": { "daytime": 200, "offpeak": 250, "latenight": 300 },
    "hour_tiers": [
      "offpeak",
      "daytime", "daytime", "daytime", "daytime", "daytime", "daytime",
      "daytime", "daytime", "daytime", "daytime", "daytime", "daytime",
      "offpeak", "offpeak", "offpeak", "offpeak",
      "latenight", "latenight"
    ],
    "extra_player_charge": 50,
    "base_players_included": 4,
    "paddle_price": 50,
    "ball_set_price": 25,
    "training_balls_price": 100,
    "equipment_charge_start_date": "2026-06-01",
    "cancellation_fee_per_slot": 100,
    "cancellation_window_hours": 24
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM pricing_schedules);

-- 4. Prices used for each booking (NULL on rows created before this migration)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
-- { "version_id": "<pricing_schedules.id>", "rules": { ...PricingRules } }

-- Verify:
-- SELECT effective_from, jsonb_array_length(rules->'hour_tiers') AS hours FROM pricing_schedules;
--   → one row, 2000-01-01, hours = 19
```

`hour_tiers[0]` is the 05:00 slot, `hour_tiers[18]` the 23:00 slot.

- [ ] **Step 2: Commit**

```bash
git add sql/pricing-schedules-migration.sql
git commit -m "feat(pricing): add pricing_schedules migration"
```

- [ ] **Step 3: STOP — owner applies the SQL**

Local `.env.local` points at the **production** Supabase project. Do not run this yourself. Ask the owner to paste the file into the Supabase SQL editor and run it, then run the verify query. The migration is additive (new table + nullable column), so the currently deployed app keeps working. Continue only after the owner confirms.

---

### Task 2: Types and the pure pricing module

**Files:**
- Create: `src/types/pricing.ts`, `src/lib/pricing.ts`, `src/lib/pricing.test.ts`

- [ ] **Step 1: Create the types**

`src/types/pricing.ts`:

```ts
export type RateTier = 'daytime' | 'offpeak' | 'latenight'

/** Every editable price. Stored as JSON in pricing_schedules.rules and bookings.pricing_snapshot.rules. */
export interface PricingRules {
  tier_prices: Record<RateTier, number>     // PHP per 1-hour slot
  hour_tiers: RateTier[]                    // 19 entries: index 0 = 05:00 slot … index 18 = 23:00 slot
  extra_player_charge: number               // PHP per player beyond base_players_included
  base_players_included: number
  paddle_price: number                      // PHP per paddle, per booking
  ball_set_price: number                    // PHP per booking (set of 4)
  training_balls_price: number              // PHP per booking (50 balls w/ basket)
  equipment_charge_start_date: string | null // 'YYYY-MM-DD' play date from which equipment is charged; null = always
  cancellation_fee_per_slot: number         // PHP kept per slot when cancelling inside the window
  cancellation_window_hours: number         // Free cancellation if more than this many hours before the slot
}

export interface PricingVersion {
  id: string
  effective_from: string   // 'YYYY-MM-DD' (Manila play date)
  rules: PricingRules
  created_by: string | null
  created_at: string
  cancelled_at: string | null
}

/** Saved on each booking row: the prices that booking was charged with. */
export interface PricingSnapshot {
  version_id: string
  rules: PricingRules
}

export interface EquipmentSelection {
  date?: string           // Play date ('YYYY-MM-DD')
  paddles?: number
  needsBalls?: boolean
  trainingBalls?: boolean
}

/** Booking details a quote is bound to. */
export interface QuoteInput {
  date: string
  timeSlots: string[]
  players: number
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
}

/** Server-signed price the customer was shown. */
export interface PriceQuote {
  amount: number
  versionId: string
  expiresAt: number  // epoch ms
  token: string      // hex HMAC
}
```

- [ ] **Step 2: Write the failing tests**

`src/lib/pricing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SEED_PRICING_RULES,
  SLOT_START_HOURS,
  getSlotRateTier,
  getPriceForSlot,
  isEquipmentChargeable,
  calculateEquipmentCharge,
  calculatePaymentAmount,
  calculateCancellationFee,
  pickPricingVersion,
  upcomingPricingVersions,
  rulesFromSnapshot,
  describeTierHours,
  isSamePricedSelection,
  diffPricingRules,
} from './pricing'
import * as legacy from './paymentConfig'
import type { PricingRules, PricingVersion } from '@/types/pricing'

const R = SEED_PRICING_RULES

function version(over: Partial<PricingVersion>): PricingVersion {
  return {
    id: 'v', effective_from: '2000-01-01', rules: R, created_by: null,
    created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
  }
}

describe('seed rules', () => {
  it('match the legacy constants exactly (removed in the cleanup task)', () => {
    expect(R.tier_prices).toEqual({
      daytime: legacy.DAYTIME_PRICE_PER_SLOT,
      offpeak: legacy.EVENING_PRICE_PER_SLOT,
      latenight: legacy.LATE_NIGHT_PRICE_PER_SLOT,
    })
    expect(R.extra_player_charge).toBe(legacy.EXTRA_PLAYER_CHARGE)
    expect(R.base_players_included).toBe(legacy.BASE_PLAYERS_INCLUDED)
    expect(R.paddle_price).toBe(legacy.PADDLE_PRICE)
    expect(R.ball_set_price).toBe(legacy.BALL_SET_PRICE)
    expect(R.training_balls_price).toBe(legacy.TRAINING_BALLS_PRICE)
    expect(R.equipment_charge_start_date).toBe(legacy.EQUIPMENT_CHARGE_START_DATE)
  })

  it('price every slot the same as the legacy functions', () => {
    for (const h of SLOT_START_HOURS) {
      const slot = `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`
      expect(getPriceForSlot(R, slot)).toBe(legacy.getPriceForSlot(slot))
    }
  })
})

describe('slot pricing', () => {
  it('uses the hour grid', () => {
    expect(getSlotRateTier(R, '05:00-06:00')).toBe('offpeak')
    expect(getSlotRateTier(R, '06:00-07:00')).toBe('daytime')
    expect(getSlotRateTier(R, '17:00-18:00')).toBe('daytime')
    expect(getSlotRateTier(R, '18:00-19:00')).toBe('offpeak')
    expect(getSlotRateTier(R, '22:00-23:00')).toBe('latenight')
    expect(getSlotRateTier(R, '23:00-00:00')).toBe('latenight')
  })

  it('follows an edited grid and edited prices', () => {
    const rules: PricingRules = {
      ...R,
      tier_prices: { daytime: 220, offpeak: 270, latenight: 330 },
      hour_tiers: R.hour_tiers.map((t, i) => (i === 12 ? 'offpeak' : t)), // 17:00 becomes off-peak
    }
    expect(getPriceForSlot(rules, '17:00-18:00')).toBe(270)
    expect(getPriceForSlot(rules, '23:00-00:00')).toBe(330)
  })

  it('throws for an hour outside the grid', () => {
    expect(() => getSlotRateTier(R, '03:00-04:00')).toThrow()
  })
})

describe('equipment', () => {
  it('is free before the charge start date and charged on/after it', () => {
    expect(isEquipmentChargeable(R, '2026-05-31')).toBe(false)
    expect(isEquipmentChargeable(R, '2026-06-01')).toBe(true)
    expect(isEquipmentChargeable(R, undefined)).toBe(false)
  })

  it('is always charged when the start date is null', () => {
    expect(isEquipmentChargeable({ ...R, equipment_charge_start_date: null }, '2020-01-01')).toBe(true)
  })

  it('sums paddles, balls and training balls', () => {
    expect(calculateEquipmentCharge(R, { date: '2026-12-01', paddles: 2, needsBalls: true, trainingBalls: true })).toBe(225)
    expect(calculateEquipmentCharge(R, { date: '2026-05-01', paddles: 2, needsBalls: true })).toBe(0)
    expect(calculateEquipmentCharge(R, { date: '2026-12-01', paddles: -3 })).toBe(0)
  })
})

describe('calculatePaymentAmount', () => {
  it('adds slots, extra players and equipment', () => {
    // 200 + 250 + 2 extra players * 50 + 1 paddle 50
    expect(calculatePaymentAmount(R, ['17:00-18:00', '18:00-19:00'], 6, { date: '2026-12-01', paddles: 1 })).toBe(600)
  })

  it('matches the legacy function for the seed rules', () => {
    const eq = { date: '2026-12-01', paddles: 3, needsBalls: true, trainingBalls: false }
    expect(calculatePaymentAmount(R, ['05:00-06:00', '22:00-23:00'], 5, eq))
      .toBe(legacy.calculatePaymentAmount(['05:00-06:00', '22:00-23:00'], 5, eq))
  })
})

describe('calculateCancellationFee', () => {
  it('is free outside the window', () => {
    expect(calculateCancellationFee(R, 450, 2, 30)).toEqual({ cancellationFee: 0, refundAmount: 450 })
  })
  it('charges per slot inside the window, refund never negative', () => {
    expect(calculateCancellationFee(R, 450, 2, 10)).toEqual({ cancellationFee: 200, refundAmount: 250 })
    expect(calculateCancellationFee(R, 100, 2, 10)).toEqual({ cancellationFee: 200, refundAmount: 0 })
  })
  it('uses the rules window and fee', () => {
    const rules = { ...R, cancellation_window_hours: 48, cancellation_fee_per_slot: 150 }
    expect(calculateCancellationFee(rules, 500, 1, 30)).toEqual({ cancellationFee: 150, refundAmount: 350 })
  })
})

describe('pickPricingVersion', () => {
  const seed = version({ id: 'seed' })
  const dec = version({ id: 'dec', effective_from: '2026-12-01' })
  const decFix = version({ id: 'decFix', effective_from: '2026-12-01', created_at: '2026-11-20T00:00:00Z' })
  const jan = version({ id: 'jan', effective_from: '2027-01-01', cancelled_at: '2026-11-21T00:00:00Z' })

  it('picks the newest version on or before the play date', () => {
    expect(pickPricingVersion([seed, dec], '2026-11-30')?.id).toBe('seed')
    expect(pickPricingVersion([seed, dec], '2026-12-01')?.id).toBe('dec')
  })
  it('breaks same-day ties by newest created_at', () => {
    expect(pickPricingVersion([decFix, seed, dec], '2026-12-05')?.id).toBe('decFix')
  })
  it('ignores cancelled versions', () => {
    expect(pickPricingVersion([seed, jan], '2027-02-01')?.id).toBe('seed')
  })
  it('returns null when nothing applies', () => {
    expect(pickPricingVersion([dec], '2026-11-01')).toBeNull()
  })
  it('lists upcoming versions after today, soonest first', () => {
    expect(upcomingPricingVersions([jan, dec, seed], '2026-11-19').map((v) => v.id)).toEqual(['dec'])
  })
})

describe('rulesFromSnapshot', () => {
  it('uses the snapshot rules, or the seed for legacy rows', () => {
    const rules = { ...R, paddle_price: 80 }
    expect(rulesFromSnapshot({ version_id: 'x', rules })).toBe(rules)
    expect(rulesFromSnapshot(null)).toBe(R)
    expect(rulesFromSnapshot(undefined)).toBe(R)
  })
})

describe('describeTierHours', () => {
  it('describes the seed grid', () => {
    expect(describeTierHours(R)).toEqual({
      daytime: '6 AM - 6 PM',
      offpeak: '5 AM - 6 AM & 6 PM - 10 PM',
      latenight: '10 PM - 12 AM',
    })
  })
  it('returns an empty string for an unused tier', () => {
    const rules = { ...R, hour_tiers: R.hour_tiers.map((t) => (t === 'latenight' ? 'offpeak' : t)) }
    expect(describeTierHours(rules).latenight).toBe('')
  })
})

describe('isSamePricedSelection', () => {
  const a = { date: '2026-12-01', timeSlots: ['08:00-09:00', '07:00-08:00'], paddles: 1, needsBalls: false, trainingBalls: false }
  it('ignores slot order', () => {
    expect(isSamePricedSelection(a, { ...a, timeSlots: ['07:00-08:00', '08:00-09:00'] })).toBe(true)
  })
  it('detects any priced change', () => {
    expect(isSamePricedSelection(a, { ...a, date: '2026-12-02' })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, timeSlots: ['07:00-08:00'] })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, paddles: 2 })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, needsBalls: true })).toBe(false)
    expect(isSamePricedSelection(a, { ...a, trainingBalls: true })).toBe(false)
  })
})

describe('diffPricingRules', () => {
  it('lists only changed fields with labels', () => {
    const next: PricingRules = {
      ...R,
      tier_prices: { ...R.tier_prices, daytime: 220 },
      hour_tiers: R.hour_tiers.map((t, i) => (i === 13 ? 'daytime' : t)), // 18:00
      equipment_charge_start_date: null,
    }
    expect(diffPricingRules(R, next)).toEqual([
      { label: 'Daytime rate', from: '₱200', to: '₱220' },
      { label: '18:00 slot', from: 'Off-peak', to: 'Daytime' },
      { label: 'Equipment charged from', from: '2026-06-01', to: 'Always' },
    ])
  })
  it('is empty when nothing changed', () => {
    expect(diffPricingRules(R, { ...R })).toEqual([])
  })
})
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run src/lib/pricing.test.ts`
Expected: FAIL — cannot resolve `./pricing`.

- [ ] **Step 4: Implement `src/lib/pricing.ts`**

```ts
/**
 * Pricing math. Pure (no DB, no React): used by the client to display prices
 * and by the server to quote and save them. Every function takes the
 * PricingRules of the version that applies to the booking's play date.
 */
import type {
  RateTier,
  PricingRules,
  PricingVersion,
  PricingSnapshot,
  EquipmentSelection,
} from '@/types/pricing'
import { getSlotStartHour } from './paymentConfig'

export const RATE_TIERS: readonly RateTier[] = ['daytime', 'offpeak', 'latenight']

export const RATE_TIER_LABELS: Record<RateTier, string> = {
  daytime: 'Daytime',
  offpeak: 'Off-peak',
  latenight: 'Late-night',
}

export const FIRST_SLOT_HOUR = 5
export const SLOT_COUNT = 19
/** Start hour of every bookable slot: 5 … 23. */
export const SLOT_START_HOURS: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, i) => FIRST_SLOT_HOUR + i)

/**
 * Prices in effect before admin-managed pricing existed. Mirrors the seed row in
 * sql/pricing-schedules-migration.sql. Use ONLY for booking rows without a
 * pricing_snapshot (they were all priced with these values) — never as a
 * fallback when the pricing table can't be read.
 */
export const SEED_PRICING_RULES: PricingRules = {
  tier_prices: { daytime: 200, offpeak: 250, latenight: 300 },
  hour_tiers: [
    'offpeak',
    'daytime', 'daytime', 'daytime', 'daytime', 'daytime', 'daytime',
    'daytime', 'daytime', 'daytime', 'daytime', 'daytime', 'daytime',
    'offpeak', 'offpeak', 'offpeak', 'offpeak',
    'latenight', 'latenight',
  ],
  extra_player_charge: 50,
  base_players_included: 4,
  paddle_price: 50,
  ball_set_price: 25,
  training_balls_price: 100,
  equipment_charge_start_date: '2026-06-01',
  cancellation_fee_per_slot: 100,
  cancellation_window_hours: 24,
}

export function getSlotRateTier(rules: PricingRules, timeSlot: string): RateTier {
  const hour = getSlotStartHour(timeSlot)
  const tier = rules.hour_tiers[hour - FIRST_SLOT_HOUR]
  if (!tier) throw new Error(`No rate tier for slot "${timeSlot}"`)
  return tier
}

export function getPriceForSlot(rules: PricingRules, timeSlot: string): number {
  return rules.tier_prices[getSlotRateTier(rules, timeSlot)]
}

/** Equipment is charged for play dates on/after the start date (always, when it is null). */
export function isEquipmentChargeable(rules: PricingRules, date?: string): boolean {
  if (!date) return false
  return !rules.equipment_charge_start_date || date >= rules.equipment_charge_start_date
}

export function calculateEquipmentCharge(rules: PricingRules, equipment?: EquipmentSelection): number {
  if (!equipment || !isEquipmentChargeable(rules, equipment.date)) return 0
  const paddles = Math.max(0, equipment.paddles ?? 0)
  return (
    paddles * rules.paddle_price +
    (equipment.needsBalls ? rules.ball_set_price : 0) +
    (equipment.trainingBalls ? rules.training_balls_price : 0)
  )
}

export function calculatePaymentAmount(
  rules: PricingRules,
  timeSlots: string[],
  playersCount: number,
  equipment?: EquipmentSelection
): number {
  const slots = timeSlots.reduce((total, slot) => total + getPriceForSlot(rules, slot), 0)
  const extraPlayers = Math.max(0, playersCount - rules.base_players_included)
  return slots + extraPlayers * rules.extra_player_charge + calculateEquipmentCharge(rules, equipment)
}

/**
 * Free cancellation more than `cancellation_window_hours` before the slot;
 * otherwise `cancellation_fee_per_slot` per slot is kept.
 */
export function calculateCancellationFee(
  rules: PricingRules,
  totalAmount: number,
  numberOfSlots: number,
  hoursUntilBooking: number
): { cancellationFee: number; refundAmount: number } {
  if (hoursUntilBooking > rules.cancellation_window_hours) {
    return { cancellationFee: 0, refundAmount: totalAmount }
  }
  const fee = numberOfSlots * rules.cancellation_fee_per_slot
  return { cancellationFee: fee, refundAmount: Math.max(0, totalAmount - fee) }
}

/** Newest non-cancelled version with effective_from <= date; same-day ties → newest created_at. */
export function pickPricingVersion(versions: PricingVersion[], date: string): PricingVersion | null {
  let best: PricingVersion | null = null
  for (const v of versions) {
    if (v.cancelled_at || v.effective_from > date) continue
    if (
      !best ||
      v.effective_from > best.effective_from ||
      (v.effective_from === best.effective_from && v.created_at > best.created_at)
    ) {
      best = v
    }
  }
  return best
}

/** Non-cancelled versions starting after `today`, soonest first. */
export function upcomingPricingVersions(versions: PricingVersion[], today: string): PricingVersion[] {
  return versions
    .filter((v) => !v.cancelled_at && v.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || a.created_at.localeCompare(b.created_at))
}

/** Prices a saved booking was charged with (seed prices for rows from before snapshots). */
export function rulesFromSnapshot(snapshot: PricingSnapshot | null | undefined): PricingRules {
  return snapshot?.rules ?? SEED_PRICING_RULES
}

function formatHour(hour: number): string {
  const h = hour % 24
  const suffix = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${suffix}`
}

/** Human ranges per tier, e.g. { offpeak: '5 AM - 6 AM & 6 PM - 10 PM' }. '' when a tier has no hours. */
export function describeTierHours(rules: PricingRules): Record<RateTier, string> {
  const ranges: Record<RateTier, string[]> = { daytime: [], offpeak: [], latenight: [] }
  let i = 0
  while (i < SLOT_COUNT) {
    const tier = rules.hour_tiers[i]
    let j = i
    while (j + 1 < SLOT_COUNT && rules.hour_tiers[j + 1] === tier) j++
    ranges[tier].push(`${formatHour(FIRST_SLOT_HOUR + i)} - ${formatHour(FIRST_SLOT_HOUR + j + 1)}`)
    i = j + 1
  }
  return {
    daytime: ranges.daytime.join(' & '),
    offpeak: ranges.offpeak.join(' & '),
    latenight: ranges.latenight.join(' & '),
  }
}

export interface PricedSelection {
  date: string
  timeSlots: string[]
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
}

/** True when nothing that affects the price changed (slot order ignored). */
export function isSamePricedSelection(a: PricedSelection, b: PricedSelection): boolean {
  const slotsA = [...a.timeSlots].sort()
  const slotsB = [...b.timeSlots].sort()
  return (
    a.date === b.date &&
    slotsA.length === slotsB.length &&
    slotsA.every((s, i) => s === slotsB[i]) &&
    (a.paddles ?? 0) === (b.paddles ?? 0) &&
    !!a.needsBalls === !!b.needsBalls &&
    !!a.trainingBalls === !!b.trainingBalls
  )
}

export interface PricingChange {
  label: string
  from: string
  to: string
}

const peso = (n: number) => `₱${n.toLocaleString()}`

/** Changed fields between two rule sets, for the admin confirmation dialog. */
export function diffPricingRules(from: PricingRules, to: PricingRules): PricingChange[] {
  const changes: PricingChange[] = []
  const add = (label: string, a: string, b: string) => {
    if (a !== b) changes.push({ label, from: a, to: b })
  }

  for (const tier of RATE_TIERS) {
    add(`${RATE_TIER_LABELS[tier]} rate`, peso(from.tier_prices[tier]), peso(to.tier_prices[tier]))
  }
  SLOT_START_HOURS.forEach((hour, i) => {
    add(
      `${String(hour).padStart(2, '0')}:00 slot`,
      RATE_TIER_LABELS[from.hour_tiers[i]],
      RATE_TIER_LABELS[to.hour_tiers[i]]
    )
  })
  add('Extra player charge', peso(from.extra_player_charge), peso(to.extra_player_charge))
  add('Players included', String(from.base_players_included), String(to.base_players_included))
  add('Paddle', peso(from.paddle_price), peso(to.paddle_price))
  add('Ball set', peso(from.ball_set_price), peso(to.ball_set_price))
  add('Training balls', peso(from.training_balls_price), peso(to.training_balls_price))
  add(
    'Equipment charged from',
    from.equipment_charge_start_date ?? 'Always',
    to.equipment_charge_start_date ?? 'Always'
  )
  add('Cancellation fee per slot', peso(from.cancellation_fee_per_slot), peso(to.cancellation_fee_per_slot))
  add('Free cancellation window', `${from.cancellation_window_hours}h`, `${to.cancellation_window_hours}h`)
  return changes
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add src/types/pricing.ts src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "feat(pricing): add pure pricing module driven by pricing rules"
```

---

### Task 3: Zod schemas

**Files:**
- Create: `src/lib/pricingSchema.ts`, `src/lib/pricingSchema.test.ts`

- [ ] **Step 1: Failing tests**

`src/lib/pricingSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pricingRulesSchema, createPricingVersionSchema, quoteInputSchema } from './pricingSchema'
import { SEED_PRICING_RULES } from './pricing'

describe('pricingRulesSchema', () => {
  it('accepts the seed rules', () => {
    expect(pricingRulesSchema.safeParse(SEED_PRICING_RULES).success).toBe(true)
  })
  it('rejects decimals, negatives and zero slot rates', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, paddle_price: 49.5 }).success).toBe(false)
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, ball_set_price: -1 }).success).toBe(false)
    expect(
      pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, tier_prices: { ...SEED_PRICING_RULES.tier_prices, daytime: 0 } }).success
    ).toBe(false)
  })
  it('requires a tier for all 19 hours', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, hour_tiers: SEED_PRICING_RULES.hour_tiers.slice(1) }).success).toBe(false)
    expect(
      pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, hour_tiers: [...SEED_PRICING_RULES.hour_tiers.slice(1), 'peak'] }).success
    ).toBe(false)
  })
  it('rejects unknown keys', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, surprise: 1 }).success).toBe(false)
  })
  it('accepts a null equipment start date, rejects a malformed one', () => {
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, equipment_charge_start_date: null }).success).toBe(true)
    expect(pricingRulesSchema.safeParse({ ...SEED_PRICING_RULES, equipment_charge_start_date: '1/6/2026' }).success).toBe(false)
  })
})

describe('createPricingVersionSchema', () => {
  it('requires a real date', () => {
    expect(createPricingVersionSchema.safeParse({ effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES }).success).toBe(true)
    expect(createPricingVersionSchema.safeParse({ effectiveFrom: '2026-02-30', rules: SEED_PRICING_RULES }).success).toBe(false)
  })
})

describe('quoteInputSchema', () => {
  const ok = { date: '2026-12-01', timeSlots: ['08:00-09:00'], players: 2, paddles: 0, needsBalls: false, trainingBalls: false }
  it('accepts a normal booking', () => {
    expect(quoteInputSchema.safeParse(ok).success).toBe(true)
  })
  it('rejects duplicate or malformed slots and silly counts', () => {
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: ['08:00-09:00', '08:00-09:00'] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: ['8am'] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, timeSlots: [] }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, players: 0 }).success).toBe(false)
    expect(quoteInputSchema.safeParse({ ...ok, paddles: 99 }).success).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/pricingSchema.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement `src/lib/pricingSchema.ts`**

```ts
import { z } from 'zod'
import { SLOT_COUNT } from './pricing'
import { MAX_PADDLES } from './paymentConfig'
import { isRealDate } from './agent/dates'

const rateTier = z.enum(['daytime', 'offpeak', 'latenight'])

const pesos = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label}: enter an amount` })
    .int(`${label}: whole pesos only`)
    .min(min, `${label}: minimum ₱${min}`)
    .max(max, `${label}: maximum ₱${max.toLocaleString()}`)

const isoDate = z.string().refine(isRealDate, 'Enter a valid date')

export const pricingRulesSchema = z.strictObject({
  tier_prices: z.strictObject({
    daytime: pesos('Daytime rate', 1, 10000),
    offpeak: pesos('Off-peak rate', 1, 10000),
    latenight: pesos('Late-night rate', 1, 10000),
  }),
  hour_tiers: z.array(rateTier).length(SLOT_COUNT, 'Every hour needs a rate tier'),
  extra_player_charge: pesos('Extra player charge', 0, 2000),
  base_players_included: z
    .number({ message: 'Players included: enter a number' })
    .int('Players included: whole number')
    .min(1, 'Players included: minimum 1')
    .max(20, 'Players included: maximum 20'),
  paddle_price: pesos('Paddle', 0, 2000),
  ball_set_price: pesos('Ball set', 0, 2000),
  training_balls_price: pesos('Training balls', 0, 5000),
  equipment_charge_start_date: isoDate.nullable(),
  cancellation_fee_per_slot: pesos('Cancellation fee', 0, 10000),
  cancellation_window_hours: z
    .number({ message: 'Cancellation window: enter hours' })
    .int('Cancellation window: whole hours')
    .min(0, 'Cancellation window: minimum 0')
    .max(168, 'Cancellation window: maximum 168 hours'),
})

export const createPricingVersionSchema = z.strictObject({
  effectiveFrom: isoDate,
  rules: pricingRulesSchema,
})

const timeSlot = z.string().regex(/^\d{2}:00-\d{2}:00$/, 'Invalid time slot')

/** Booking details that a price quote is bound to (public input: validate strictly). */
export const quoteInputSchema = z.strictObject({
  date: isoDate,
  timeSlots: z
    .array(timeSlot)
    .min(1, 'Select at least one slot')
    .max(SLOT_COUNT)
    .refine((s) => new Set(s).size === s.length, 'Duplicate time slots'),
  players: z.number().int().min(1).max(30),
  paddles: z.number().int().min(0).max(MAX_PADDLES),
  needsBalls: z.boolean(),
  trainingBalls: z.boolean(),
})
```

- [ ] **Step 3: Test and commit**

Run: `npm test` → PASS.

```bash
git add src/lib/pricingSchema.ts src/lib/pricingSchema.test.ts
git commit -m "feat(pricing): add pricing and quote validation schemas"
```

---

### Task 4: Pricing service (server)

**Files:**
- Create: `src/lib/pricingService.ts`, `src/lib/pricingService.test.ts`

- [ ] **Step 1: Failing tests**

`src/lib/pricingService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEED_PRICING_RULES } from './pricing'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ supabase: { from } }))

import {
  getPricingVersions,
  getPricingForDate,
  createPricingVersion,
  cancelPricingVersion,
  PricingUnavailableError,
} from './pricingService'

/** Chainable Supabase query stub that resolves to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'gt', 'order', 'single', 'maybeSingle']) {
    q[m] = vi.fn(() => q)
  }
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return q
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'seed', effective_from: '2000-01-01', rules: SEED_PRICING_RULES,
  created_by: null, created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
})

const NOW = new Date('2026-11-19T04:00:00Z') // 12:00 Manila, 2026-11-19

describe('pricingService', () => {
  beforeEach(() => from.mockReset())

  it('returns validated versions', async () => {
    from.mockReturnValue(query({ data: [row()], error: null }))
    const versions = await getPricingVersions()
    expect(versions).toHaveLength(1)
    expect(versions[0].rules).toEqual(SEED_PRICING_RULES)
  })

  it('throws when the table cannot be read', async () => {
    from.mockReturnValue(query({ data: null, error: { message: 'boom' } }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('throws when the table is empty', async () => {
    from.mockReturnValue(query({ data: [], error: null }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('throws when a row has invalid rules (never prices with bad data)', async () => {
    from.mockReturnValue(query({ data: [row({ rules: { ...SEED_PRICING_RULES, paddle_price: -5 } })], error: null }))
    await expect(getPricingVersions()).rejects.toBeInstanceOf(PricingUnavailableError)
  })

  it('getPricingForDate picks by play date', async () => {
    from.mockReturnValue(
      query({ data: [row(), row({ id: 'dec', effective_from: '2026-12-01' })], error: null })
    )
    expect((await getPricingForDate('2026-12-02')).id).toBe('dec')
  })

  it('createPricingVersion rejects a past date without touching the DB', async () => {
    const result = await createPricingVersion(
      { effectiveFrom: '2026-11-18', rules: SEED_PRICING_RULES, createdBy: 'a1' },
      NOW
    )
    expect(result).toEqual({ success: false, error: 'The start date cannot be in the past.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('createPricingVersion accepts today (apply now)', async () => {
    from.mockReturnValue(query({ data: row({ id: 'new', effective_from: '2026-11-19', created_by: 'a1' }), error: null }))
    const result = await createPricingVersion(
      { effectiveFrom: '2026-11-19', rules: SEED_PRICING_RULES, createdBy: 'a1' },
      NOW
    )
    expect(result.success).toBe(true)
  })

  it('cancelPricingVersion only cancels upcoming versions', async () => {
    from.mockReturnValue(query({ data: [], error: null }))
    expect(await cancelPricingVersion('seed', NOW)).toEqual({
      success: false,
      error: 'Only upcoming price changes can be cancelled.',
    })
    from.mockReturnValue(query({ data: [{ id: 'dec' }], error: null }))
    expect(await cancelPricingVersion('dec', NOW)).toEqual({ success: true })
  })
})
```

Run: `npx vitest run src/lib/pricingService.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement `src/lib/pricingService.ts`**

```ts
/**
 * Pricing Service
 * Versioned prices in pricing_schedules (service role only).
 * Fails closed: unreadable, empty or invalid data throws PricingUnavailableError.
 */
import { supabase } from './supabase-server'
import { pricingRulesSchema } from './pricingSchema'
import { pickPricingVersion } from './pricing'
import { manilaNow } from './agent/dates'
import type { PricingRules, PricingVersion } from '@/types/pricing'

export class PricingUnavailableError extends Error {
  constructor(message = 'Prices are unavailable right now. Please try again in a moment.') {
    super(message)
    this.name = 'PricingUnavailableError'
  }
}

interface PricingRow {
  id: string
  effective_from: string
  rules: unknown
  created_by: string | null
  created_at: string
  cancelled_at: string | null
}

function toVersion(row: PricingRow): PricingVersion {
  const parsed = pricingRulesSchema.safeParse(row.rules)
  if (!parsed.success) {
    console.error('Invalid pricing rules in pricing_schedules row', row.id, parsed.error.issues)
    throw new PricingUnavailableError()
  }
  return {
    id: row.id,
    effective_from: row.effective_from,
    rules: parsed.data,
    created_by: row.created_by,
    created_at: row.created_at,
    cancelled_at: row.cancelled_at,
  }
}

export function manilaToday(now: Date = new Date()): string {
  return manilaNow(now).date
}

/** All non-cancelled versions, oldest first. */
export async function getPricingVersions(): Promise<PricingVersion[]> {
  const { data, error } = await supabase
    .from('pricing_schedules')
    .select('*')
    .is('cancelled_at', null)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching pricing schedules:', error)
    throw new PricingUnavailableError()
  }
  if (!data || data.length === 0) {
    console.error('pricing_schedules has no active rows')
    throw new PricingUnavailableError()
  }
  return (data as PricingRow[]).map(toVersion)
}

/** One version by id, including cancelled ones (a quote may reference it). */
export async function getPricingVersionById(id: string): Promise<PricingVersion | null> {
  const { data, error } = await supabase.from('pricing_schedules').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('Error fetching pricing version:', error)
    throw new PricingUnavailableError()
  }
  return data ? toVersion(data as PricingRow) : null
}

/** The version that prices a given play date. */
export async function getPricingForDate(date: string): Promise<PricingVersion> {
  const version = pickPricingVersion(await getPricingVersions(), date)
  if (!version) throw new PricingUnavailableError()
  return version
}

export async function createPricingVersion(
  input: { effectiveFrom: string; rules: PricingRules; createdBy: string },
  now: Date = new Date()
): Promise<{ success: true; version: PricingVersion } | { success: false; error: string }> {
  if (input.effectiveFrom < manilaToday(now)) {
    return { success: false, error: 'The start date cannot be in the past.' }
  }

  const { data, error } = await supabase
    .from('pricing_schedules')
    .insert({ effective_from: input.effectiveFrom, rules: input.rules, created_by: input.createdBy })
    .select()
    .single()

  if (error || !data) {
    console.error('Error creating pricing version:', error)
    return { success: false, error: 'Failed to save prices' }
  }
  return { success: true, version: toVersion(data as PricingRow) }
}

/** Cancel an upcoming version (effective_from after today). Versions in effect can't be cancelled. */
export async function cancelPricingVersion(
  id: string,
  now: Date = new Date()
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('pricing_schedules')
    .update({ cancelled_at: now.toISOString() })
    .eq('id', id)
    .is('cancelled_at', null)
    .gt('effective_from', manilaToday(now))
    .select('id')

  if (error) {
    console.error('Error cancelling pricing version:', error)
    return { success: false, error: 'Failed to cancel the price change' }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Only upcoming price changes can be cancelled.' }
  }
  return { success: true }
}
```

- [ ] **Step 3: Test and commit**

Run: `npm test` → PASS.

```bash
git add src/lib/pricingService.ts src/lib/pricingService.test.ts
git commit -m "feat(pricing): add pricing schedule service (fails closed)"
```

---

### Task 5: Signed price quotes

**Files:**
- Create: `src/lib/priceQuote.ts`, `src/lib/priceQuote.test.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Failing tests**

`src/lib/priceQuote.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPriceQuote, verifyPriceQuote, QUOTE_TTL_MS } from './priceQuote'
import { SEED_PRICING_RULES } from './pricing'
import type { QuoteInput } from '@/types/pricing'

const input: QuoteInput = {
  date: '2026-12-01', timeSlots: ['18:00-19:00', '17:00-18:00'], players: 2,
  paddles: 1, needsBalls: true, trainingBalls: false,
}
const NOW = 1_800_000_000_000

describe('price quotes', () => {
  beforeEach(() => vi.stubEnv('PRICE_QUOTE_SECRET', 'a'.repeat(64)))
  afterEach(() => vi.unstubAllEnvs())

  it('quotes the amount from the rules', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(q.amount).toBe(200 + 250 + 50 + 25)
    expect(q.versionId).toBe('v1')
    expect(q.expiresAt).toBe(NOW + QUOTE_TTL_MS)
  })

  it('verifies an untouched quote, regardless of slot order', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote(q, { ...input, timeSlots: ['17:00-18:00', '18:00-19:00'] }, NOW + 1000)).toEqual({ ok: true })
  })

  it('rejects a changed amount, version, expiry or booking detail', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote({ ...q, amount: 1 }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, versionId: 'v2' }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, expiresAt: q.expiresAt + 1 }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, timeSlots: ['17:00-18:00'] }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, paddles: 0 }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote(q, { ...input, date: '2026-12-02' }, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ ...q, token: 'zz' }, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects an expired quote', () => {
    const q = createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)
    expect(verifyPriceQuote(q, input, NOW + QUOTE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a malformed quote object', () => {
    expect(verifyPriceQuote(null as never, input, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyPriceQuote({ amount: 1.5, versionId: 'v', expiresAt: NOW, token: 'ab' }, input, NOW))
      .toEqual({ ok: false, reason: 'invalid' })
  })

  it('fails closed without a strong secret', () => {
    vi.stubEnv('PRICE_QUOTE_SECRET', 'short')
    expect(() => createPriceQuote(input, SEED_PRICING_RULES, 'v1', NOW)).toThrow(/PRICE_QUOTE_SECRET/)
  })
})
```

Run: `npx vitest run src/lib/priceQuote.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement `src/lib/priceQuote.ts`**

```ts
/**
 * Signed price quotes (server only).
 * The payment screen shows quote.amount; on submit the server verifies the
 * signature against the same booking details and saves exactly that amount,
 * so a price change while the customer is paying never changes what they owe.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { calculatePaymentAmount } from './pricing'
import type { PricingRules, PriceQuote, QuoteInput } from '@/types/pricing'

export const QUOTE_TTL_MS = 60 * 60 * 1000 // 60 minutes

function secret(): string {
  const s = process.env.PRICE_QUOTE_SECRET ?? ''
  if (s.length < 32) throw new Error('PRICE_QUOTE_SECRET is missing or shorter than 32 characters')
  return s
}

function normalize(input: QuoteInput): QuoteInput {
  return {
    date: input.date,
    timeSlots: [...input.timeSlots].sort(),
    players: input.players,
    paddles: Math.max(0, Math.trunc(input.paddles || 0)),
    needsBalls: !!input.needsBalls,
    trainingBalls: !!input.trainingBalls,
  }
}

function canonical(input: QuoteInput, amount: number, versionId: string, expiresAt: number): string {
  const n = normalize(input)
  return JSON.stringify(['v1', n.date, n.timeSlots, n.players, n.paddles, n.needsBalls, n.trainingBalls, amount, versionId, expiresAt])
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

export function createPriceQuote(
  input: QuoteInput,
  rules: PricingRules,
  versionId: string,
  now: number = Date.now()
): PriceQuote {
  const n = normalize(input)
  const amount = calculatePaymentAmount(rules, n.timeSlots, n.players, {
    date: n.date,
    paddles: n.paddles,
    needsBalls: n.needsBalls,
    trainingBalls: n.trainingBalls,
  })
  const expiresAt = now + QUOTE_TTL_MS
  return { amount, versionId, expiresAt, token: sign(canonical(n, amount, versionId, expiresAt)) }
}

export type QuoteCheck = { ok: true } | { ok: false; reason: 'invalid' | 'expired' }

export function verifyPriceQuote(quote: PriceQuote, input: QuoteInput, now: number = Date.now()): QuoteCheck {
  if (
    !quote ||
    typeof quote.token !== 'string' ||
    typeof quote.versionId !== 'string' ||
    !Number.isInteger(quote.amount) ||
    quote.amount < 0 ||
    !Number.isFinite(quote.expiresAt)
  ) {
    return { ok: false, reason: 'invalid' }
  }

  const expected = Buffer.from(sign(canonical(input, quote.amount, quote.versionId, quote.expiresAt)), 'hex')
  const given = Buffer.from(quote.token, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'invalid' }
  }
  if (now > quote.expiresAt) return { ok: false, reason: 'expired' }
  return { ok: true }
}
```

- [ ] **Step 3: Document the env var**

Append to `.env.local.example`:

```bash

# Signs the price shown on the payment screen so the customer is charged exactly that amount.
# Server-only, at least 32 characters. Generate with: openssl rand -hex 32
PRICE_QUOTE_SECRET=
```

- [ ] **Step 4: Test and commit**

Run: `npm test` → PASS.

```bash
git add src/lib/priceQuote.ts src/lib/priceQuote.test.ts .env.local.example
git commit -m "feat(pricing): add signed price quotes"
```

- [ ] **Step 5: STOP — owner sets the secret**

Ask the owner to add `PRICE_QUOTE_SECRET` (output of `openssl rand -hex 32`) to `.env.local` and to Vercel (Production + Preview, type "Secret"). Never print or commit the value. Continue only after they confirm.

---

### Task 6: Pricing server actions and hooks

**Files:**
- Create: `src/actions/pricing.ts`, `src/hooks/usePricing.ts`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Failing guard + behaviour tests**

In `src/actions/actionGuards.test.ts`:

1. Add next to the other automocks: `vi.mock('@/lib/pricingService')`
2. Add imports:

```ts
import * as pricingActions from './pricing'
import * as pricingService from '@/lib/pricingService'
import { SEED_PRICING_RULES } from '@/lib/pricing'
```

3. Extend `ADMIN_ACTIONS`:

```ts
  ['createPricingVersionAction', (t) => pricingActions.createPricingVersionAction(t, { effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES })],
  ['cancelPricingVersionAction', (t) => pricingActions.cancelPricingVersionAction(t, 'v1')],
```

4. Append:

```ts
describe('pricing actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
  })

  it('createPricingVersionAction records the admin and validates first', async () => {
    vi.mocked(pricingService.createPricingVersion).mockResolvedValue({ success: true, version: {} as never })
    await pricingActions.createPricingVersionAction('tok', { effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES })
    expect(pricingService.createPricingVersion).toHaveBeenCalledWith({
      effectiveFrom: '2026-12-01', rules: SEED_PRICING_RULES, createdBy: 'admin-1',
    })
  })

  it('createPricingVersionAction rejects invalid prices without touching the DB', async () => {
    const result = await pricingActions.createPricingVersionAction('tok', {
      effectiveFrom: '2026-12-01',
      rules: { ...SEED_PRICING_RULES, paddle_price: -1 },
    })
    expect(result.success).toBe(false)
    expect(pricingService.createPricingVersion).not.toHaveBeenCalled()
  })

  it('getPricingVersionsAction hides who created each version', async () => {
    vi.mocked(pricingService.getPricingVersions).mockResolvedValue([
      { id: 'v', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: 'admin-1', created_at: 'x', cancelled_at: null },
    ])
    const result = await pricingActions.getPricingVersionsAction()
    expect(result).toMatchObject({ success: true, versions: [{ id: 'v', created_by: null }] })
  })

  it('getPricingVersionsAction reports unavailability instead of throwing', async () => {
    vi.mocked(pricingService.getPricingVersions).mockRejectedValue(new Error('down'))
    await expect(pricingActions.getPricingVersionsAction()).resolves.toMatchObject({ success: false })
  })

  it('getPriceQuoteAction rejects bad input without loading prices', async () => {
    const result = await pricingActions.getPriceQuoteAction({
      date: 'nope', timeSlots: [], players: 2, paddles: 0, needsBalls: false, trainingBalls: false,
    })
    expect(result.success).toBe(false)
    expect(pricingService.getPricingForDate).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/actions/actionGuards.test.ts` → Expected: FAIL (`./pricing` missing).

- [ ] **Step 2: Implement `src/actions/pricing.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/actionAuth'
import {
  getPricingVersions,
  getPricingForDate,
  createPricingVersion,
  cancelPricingVersion,
} from '@/lib/pricingService'
import { createPriceQuote } from '@/lib/priceQuote'
import { createPricingVersionSchema, quoteInputSchema } from '@/lib/pricingSchema'
import type { PricingRules, PricingVersion, PriceQuote, QuoteInput } from '@/types/pricing'

const UNAVAILABLE = 'Prices are unavailable right now. Please try again in a moment.'

export type PricingVersionsResult =
  | { success: true; versions: PricingVersion[] }
  | { success: false; error: string }

/**
 * Active price versions (public: drives every price shown in the app).
 */
export async function getPricingVersionsAction(): Promise<PricingVersionsResult> {
  try {
    const versions = await getPricingVersions()
    return { success: true, versions: versions.map((v) => ({ ...v, created_by: null })) }
  } catch (error) {
    console.error('Failed to load pricing versions:', error)
    return { success: false, error: UNAVAILABLE }
  }
}

export type PriceQuoteResult = { success: true; quote: PriceQuote } | { success: false; error: string }

/**
 * Signed quote for the payment screen (public).
 */
export async function getPriceQuoteAction(input: QuoteInput): Promise<PriceQuoteResult> {
  const parsed = quoteInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid booking details.' }

  try {
    const version = await getPricingForDate(parsed.data.date)
    return { success: true, quote: createPriceQuote(parsed.data, version.rules, version.id) }
  } catch (error) {
    console.error('Failed to create price quote:', error)
    return { success: false, error: UNAVAILABLE }
  }
}

/**
 * Add a price version (admin only). effectiveFrom = today applies immediately.
 */
export async function createPricingVersionAction(
  accessToken: string,
  input: { effectiveFrom: string; rules: PricingRules }
): Promise<{ success: boolean; error?: string; version?: PricingVersion }> {
  const adminId = await requireAdmin(accessToken)

  const parsed = createPricingVersionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid prices' }
  }

  const result = await createPricingVersion({
    effectiveFrom: parsed.data.effectiveFrom,
    rules: parsed.data.rules,
    createdBy: adminId,
  })

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

/**
 * Cancel an upcoming price version (admin only).
 */
export async function cancelPricingVersionAction(
  accessToken: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await cancelPricingVersion(id)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}
```

- [ ] **Step 3: Implement `src/hooks/usePricing.ts`**

```ts
'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPricingVersionsAction,
  getPriceQuoteAction,
  createPricingVersionAction,
  cancelPricingVersionAction,
} from '@/actions/pricing'
import { getAccessToken } from '@/lib/accessToken'
import { pickPricingVersion } from '@/lib/pricing'
import type { PricingRules, PricingVersion, PriceQuote, QuoteInput } from '@/types/pricing'

export const PRICING_QUERY_KEY = ['pricing'] as const
const QUOTE_QUERY_KEY = 'priceQuote'

/** All active price versions. */
export function usePricingVersions() {
  return useQuery<PricingVersion[]>({
    queryKey: PRICING_QUERY_KEY,
    queryFn: async () => {
      const result = await getPricingVersionsAction()
      if (!result.success) throw new Error(result.error)
      return result.versions
    },
    staleTime: 60 * 1000,
  })
}

/** The version (and rules) that price a play date. rules is null while loading or on error. */
export function usePricingForDate(date: string) {
  const query = usePricingVersions()
  const version = useMemo(
    () => (query.data ? pickPricingVersion(query.data, date) : null),
    [query.data, date]
  )
  return {
    version,
    rules: (version?.rules ?? null) as PricingRules | null,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/** Signed quote for the payment screen. Disabled while input is null. */
export function usePriceQuote(input: QuoteInput | null) {
  return useQuery<PriceQuote>({
    queryKey: [QUOTE_QUERY_KEY, input],
    queryFn: async () => {
      const result = await getPriceQuoteAction(input as QuoteInput)
      if (!result.success) throw new Error(result.error)
      return result.quote
    },
    enabled: !!input,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

/** Admin: add a price version (apply now or schedule). */
export function useCreatePricingVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { effectiveFrom: string; rules: PricingRules }) =>
      createPricingVersionAction(await getAccessToken(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_QUERY_KEY })
    },
  })
}

/** Admin: cancel an upcoming price version. */
export function useCancelPricingVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => cancelPricingVersionAction(await getAccessToken(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_QUERY_KEY })
    },
  })
}
```

(Open quotes are deliberately **not** invalidated on a price change: the customer keeps the price they were shown, which is the point.)

- [ ] **Step 4: Test, type-check, commit**

Run: `npm test && npx tsc --noEmit` → PASS / no errors.

```bash
git add src/actions/pricing.ts src/hooks/usePricing.ts src/actions/actionGuards.test.ts
git commit -m "feat(pricing): add pricing actions and hooks"
```

---

### Task 7: Customer bookings use the signed quote

**Files:**
- Modify: `src/types/booking.ts`, `src/lib/paymentService.ts`, `src/actions/payment.ts`, `src/hooks/usePayment.ts`, `src/components/booking/PaymentScreen.tsx`, `src/app/page.tsx`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Replace the `submitPaymentAction` tests**

In `actionGuards.test.ts`, add imports:

```ts
import { createPriceQuote } from '@/lib/priceQuote'
```

Replace the whole `describe('submitPaymentAction', …)` block (added in Plan 1) with:

```ts
describe('submitPaymentAction', () => {
  const body = {
    name: 'X', phone: '0917', email: 'x@y.z', date: '2026-12-01',
    timeSlots: ['08:00-09:00'], courtNumber: 1, players: 2,
    paddles: 0, needsBalls: false, trainingBalls: false,
  }
  const quoteInput = { date: body.date, timeSlots: body.timeSlots, players: 2, paddles: 0, needsBalls: false, trainingBalls: false }
  const version = { id: 'v1', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: null, created_at: 'x', cancelled_at: null }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PRICE_QUOTE_SECRET', 'q'.repeat(64))
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
    vi.mocked(pricingService.getPricingVersionById).mockResolvedValue(version)
    vi.mocked(paymentService.createBookingWithPendingPayment).mockResolvedValue({ success: false, error: 'x' })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('saves the quoted amount and snapshot, linked to the verified user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const quote = createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction('tok', body, quote)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        payment_amount: quote.amount,
        pricing_snapshot: { version_id: 'v1', rules: SEED_PRICING_RULES },
      })
    )
  })

  it('books as a guest when there is no token', async () => {
    const quote = createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    await payment.submitPaymentAction(null, body, quote)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: undefined })
    )
  })

  it('rejects a tampered quote with quote_invalid and creates nothing', async () => {
    const quote = createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, body, { ...quote, amount: 1 })
    expect(result).toMatchObject({ success: false, code: 'quote_invalid' })
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })

  it('rejects a quote for different booking details', async () => {
    const quote = createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    const result = await payment.submitPaymentAction(null, { ...body, paddles: 2 }, quote)
    expect(result).toMatchObject({ success: false, code: 'quote_invalid' })
  })

  it('fails closed when the secret is missing', async () => {
    const quote = createPriceQuote(quoteInput, SEED_PRICING_RULES, 'v1')
    vi.stubEnv('PRICE_QUOTE_SECRET', '')
    const result = await payment.submitPaymentAction(null, body, quote)
    expect(result.success).toBe(false)
    expect(paymentService.createBookingWithPendingPayment).not.toHaveBeenCalled()
  })
})
```

Add `afterEach` to the vitest import at the top of the file.

Run: `npx vitest run src/actions/actionGuards.test.ts` → Expected: FAIL.

- [ ] **Step 2: Booking type**

In `src/types/booking.ts`, add `import type { PricingSnapshot } from './pricing'` at the top and, inside `Booking` after `payment_amount`:

```ts
  pricing_snapshot?: PricingSnapshot | null // Prices this booking was charged with (null on legacy rows)
```

- [ ] **Step 3: `createBookingWithPendingPayment` takes the amount instead of computing it**

In `src/lib/paymentService.ts`:
1. Remove `calculatePaymentAmount,` from the `./paymentConfig` import; add `import type { PricingSnapshot } from '@/types/pricing'`.
2. Add to the payload type: `payment_amount: number` and `pricing_snapshot: PricingSnapshot`.
3. Delete the `// Total includes equipment rental…` comment and the `const amount = calculatePaymentAmount(...)` block.
4. In `rows`, replace `payment_amount: amount,` with:

```ts
    payment_amount: payload.payment_amount,
    pricing_snapshot: payload.pricing_snapshot,
```

5. Update the function's doc comment to: `Create bookings when user submits payment, at the amount from their verified price quote.`

- [ ] **Step 4: `submitPaymentAction` verifies the quote**

In `src/actions/payment.ts`:
1. Add imports:

```ts
import { verifyPriceQuote } from '@/lib/priceQuote'
import { getPricingVersionById } from '@/lib/pricingService'
import { quoteInputSchema } from '@/lib/pricingSchema'
import type { PriceQuote } from '@/types/pricing'
```

2. Replace the signature and everything up to (and including) the `createBookingWithPendingPayment({...})` call with:

```ts
const PRICES_CHANGED = 'Prices were updated. Please review the new total before paying.'
const QUOTE_EXPIRED = 'Your price quote expired. Please review the total before paying.'

export async function submitPaymentAction(
  accessToken: string | null,
  payload: {
    name: string
    phone: string
    email: string
    date: string
    timeSlots: string[]
    courtNumber: number
    players: number
    paddles?: number
    needsBalls?: boolean
    trainingBalls?: boolean
    gcashReference?: string
  },
  quote: PriceQuote
): Promise<{ success: boolean; bookings?: Booking[]; error?: string; code?: 'quote_invalid' }> {
  const parsed = quoteInputSchema.safeParse({
    date: payload.date,
    timeSlots: payload.timeSlots,
    players: payload.players,
    paddles: payload.paddles ?? 0,
    needsBalls: payload.needsBalls ?? false,
    trainingBalls: payload.trainingBalls ?? false,
  })
  if (!parsed.success) {
    return { success: false, error: 'Invalid booking details.' }
  }

  // Check if date is closed
  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date.' }
  }

  // Honour the price the customer was shown (signed quote), or ask them to review
  let snapshot
  try {
    const check = verifyPriceQuote(quote, parsed.data)
    if (!check.ok) {
      return { success: false, code: 'quote_invalid', error: check.reason === 'expired' ? QUOTE_EXPIRED : PRICES_CHANGED }
    }
    const version = await getPricingVersionById(quote.versionId)
    if (!version) {
      return { success: false, code: 'quote_invalid', error: PRICES_CHANGED }
    }
    snapshot = { version_id: version.id, rules: version.rules }
  } catch (error) {
    console.error('Price quote check failed:', error)
    return { success: false, error: 'Prices are unavailable right now. Please try again in a moment.' }
  }

  // Link the booking to the signed-in user (verified), or book as a guest
  const userId = (await getUserIdFromToken(accessToken)) ?? undefined

  const result = await createBookingWithPendingPayment({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    timeSlots: payload.timeSlots,
    court_number: payload.courtNumber,
    players: payload.players,
    paddles: payload.paddles,
    needs_balls: payload.needsBalls,
    training_balls: payload.trainingBalls,
    user_id: userId,
    gcash_reference: payload.gcashReference,
    payment_amount: quote.amount,
    pricing_snapshot: snapshot,
  })
```

(The rest of the function — revalidation and the admin alert email, which already uses `booking.payment_amount` — is unchanged.)

- [ ] **Step 5: `useSubmitPayment` passes the quote**

In `src/hooks/usePayment.ts`, add `import type { PriceQuote } from '@/types/pricing'` and replace the mutationFn:

```ts
    mutationFn: async ({
      payload,
      quote,
    }: {
      payload: Parameters<typeof submitPaymentAction>[1]
      quote: PriceQuote
    }) => submitPaymentAction((await getAccessToken()) || null, payload, quote),
```

- [ ] **Step 6: `PaymentScreen` owns the quote**

In `src/components/booking/PaymentScreen.tsx`:

1. Imports: replace `import { isEquipmentChargeable, formatEquipmentSummary } from '@/lib/paymentConfig'` with:

```ts
import { formatEquipmentSummary } from '@/lib/paymentConfig'
import { isEquipmentChargeable } from '@/lib/pricing'
import { usePriceQuote, usePricingForDate } from '@/hooks/usePricing'
import type { QuoteInput } from '@/types/pricing'
```

and add `useMemo` to the React import.

2. Remove `amount: number` from `PaymentScreenProps` and `amount,` from the destructured props.

3. After `const submitPayment = useSubmitPayment()`, add:

```ts
  // Server-signed price: the amount shown here is exactly what gets saved
  const quoteInput = useMemo<QuoteInput>(
    () => ({
      date: bookingData.date,
      timeSlots: bookingData.timeSlots,
      players: bookingData.players,
      paddles: bookingData.paddles,
      needsBalls: bookingData.needsBalls,
      trainingBalls: bookingData.trainingBalls,
    }),
    [bookingData]
  )
  const { data: quote, isLoading: quoteLoading, error: quoteError, refetch: refetchQuote } = usePriceQuote(quoteInput)
  const { rules } = usePricingForDate(bookingData.date)
```

4. Replace `handleSubmitPayment` with:

```ts
  const handleSubmitPayment = async () => {
    if (!quote) return
    try {
      const result = await submitPayment.mutateAsync({
        payload: {
          name: bookingData.name,
          phone: bookingData.phone,
          email: bookingData.email,
          date: bookingData.date,
          timeSlots: bookingData.timeSlots,
          courtNumber: bookingData.courtNumber,
          players: bookingData.players,
          paddles: bookingData.paddles,
          needsBalls: bookingData.needsBalls,
          trainingBalls: bookingData.trainingBalls,
          gcashReference: gcashReference.trim(),
        },
        quote,
      })

      if (result.success && result.bookings) {
        setSubmittedBookings(result.bookings)
        onPaymentSubmitted(result.bookings)
        toast.success('Payment submitted! Waiting for confirmation.')
      } else if (result.code === 'quote_invalid') {
        toast.error(result.error)
        await refetchQuote()
      } else {
        toast.error(result.error || 'Failed to submit payment')
      }
    } catch {
      toast.error('Failed to submit payment')
    }
  }
```

5. Replace line ~103 `const equipmentChargeable = isEquipmentChargeable(bookingData.date)` with:

```ts
  const equipmentChargeable = rules ? isEquipmentChargeable(rules, bookingData.date) : false
```

6. In the "Awaiting Verification" summary (~line 126) replace `₱{amount.toLocaleString()}` with:

```tsx
₱{(submittedBookings[0]?.payment_amount ?? 0).toLocaleString()}
```

7. Replace the "Amount to Pay" block (~lines 154–158) with:

```tsx
          {/* Amount */}
          <div className="text-center mb-3">
            <p className="text-sm text-gray-500">Amount to Pay</p>
            {quoteLoading ? (
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto my-1" />
            ) : quote ? (
              <p className="text-2xl font-bold text-gray-900">₱{quote.amount.toLocaleString()}</p>
            ) : (
              <div className="text-sm text-red-600">
                <p>{quoteError instanceof Error ? quoteError.message : 'Prices are unavailable right now.'}</p>
                <button type="button" onClick={() => refetchQuote()} className="underline mt-1">
                  Try again
                </button>
              </div>
            )}
          </div>
```

8. On the submit button (~line 261) extend `disabled` to `submitPayment.isPending || !gcashReference.trim() || !quote`.

- [ ] **Step 7: `page.tsx` stops computing the amount**

In `src/app/page.tsx`: delete `import { calculatePaymentAmount } from '@/lib/paymentConfig'`, delete the `// Calculate payment amount …` comment and the whole `const paymentAmount = …` block, and remove `amount={paymentAmount}` from `<PaymentScreen … />`.

- [ ] **Step 8: Test, type-check, commit**

Run: `npm test && npx tsc --noEmit` → PASS / no errors.

```bash
git add src/types/booking.ts src/lib/paymentService.ts src/actions/payment.ts src/hooks/usePayment.ts src/components/booking/PaymentScreen.tsx src/app/page.tsx src/actions/actionGuards.test.ts
git commit -m "feat(pricing): charge the signed quoted amount and save a price snapshot"
```

---

### Task 8: Admin manual bookings and reschedules

**Files:**
- Modify: `src/lib/bookingService.ts`, `src/components/admin/AdminBookingForm.tsx`, `src/app/admin/page.tsx:72-83`

- [ ] **Step 1: Service imports**

In `src/lib/bookingService.ts`:
1. Remove `calculatePaymentAmount,` from the `./paymentConfig` import.
2. Add:

```ts
import { calculatePaymentAmount, isSamePricedSelection } from './pricing'
import { getPricingForDate } from './pricingService'
import type { PricingSnapshot, PricingVersion } from '@/types/pricing'
```

3. Add this helper above `createAdminBooking`:

```ts
const PRICING_UNAVAILABLE = 'Prices are unavailable right now. Please try again in a moment.'

/** Version for a play date, or null when prices can't be loaded (callers fail the booking). */
async function loadPricingOrNull(date: string): Promise<PricingVersion | null> {
  try {
    return await getPricingForDate(date)
  } catch (error) {
    console.error('Failed to load pricing:', error)
    return null
  }
}
```

- [ ] **Step 2: `createAdminBooking` prices from the schedule**

Replace the `const amount = calculatePaymentAmount(payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {...})` block in `createAdminBooking` with:

```ts
  const version = await loadPricingOrNull(payload.date)
  if (!version) return { success: false, error: PRICING_UNAVAILABLE }

  const amount = calculatePaymentAmount(version.rules, payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {
    date: payload.date,
    paddles: paddlesCount,
    needsBalls,
    trainingBalls,
  })
  const pricingSnapshot: PricingSnapshot = { version_id: version.id, rules: version.rules }
```

and in its `rows` add after `payment_amount: amount,`:

```ts
    pricing_snapshot: pricingSnapshot,
```

- [ ] **Step 3: `updateAdminBooking` keeps the stored price unless the selection changed**

Replace the `const amount = calculatePaymentAmount(payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {...})` block in `updateAdminBooking` (it must stay **before** the delete) with:

```ts
  // Keep the original price unless something that affects it changed
  const first = existing[0]
  const unchanged =
    typeof first.payment_amount === 'number' &&
    isSamePricedSelection(
      {
        date: first.date,
        timeSlots: existing.map((b) => b.time_slot),
        paddles: first.paddles_count ?? 0,
        needsBalls: !!first.needs_balls,
        trainingBalls: !!first.training_balls,
      },
      { date: payload.date, timeSlots: payload.timeSlots, paddles: paddlesCount, needsBalls, trainingBalls }
    )

  let amount: number
  let pricingSnapshot: PricingSnapshot | null
  if (unchanged) {
    amount = first.payment_amount as number
    pricingSnapshot = first.pricing_snapshot ?? null
  } else {
    const version = await loadPricingOrNull(payload.date)
    if (!version) return { success: false, error: PRICING_UNAVAILABLE }
    amount = calculatePaymentAmount(version.rules, payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {
      date: payload.date,
      paddles: paddlesCount,
      needsBalls,
      trainingBalls,
    })
    pricingSnapshot = { version_id: version.id, rules: version.rules }
  }
```

and in its `rows` add after `payment_amount: amount,`:

```ts
    pricing_snapshot: pricingSnapshot,
```

(A name-only edit therefore keeps the amount; changing date, slots or equipment re-prices with the version for the new date.)

- [ ] **Step 4: Reschedules carry the snapshot (and training balls)**

In `approveRescheduleRequest`'s `rows` (~line 615–632), after `payment_amount: first.payment_amount,` add:

```ts
    pricing_snapshot: first.pricing_snapshot ?? null,
```

and after `needs_balls: first.needs_balls ?? false,` add:

```ts
    training_balls: first.training_balls ?? false,
```

(The training-balls line fixes a pre-existing omission: rescheduled bookings lost their training-balls flag, which also hides that equipment from Finance.)

- [ ] **Step 5: `AdminBookingForm` uses schedule prices and shows a kept price**

In `src/components/admin/AdminBookingForm.tsx`:
1. Replace `import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/paymentConfig'` with:

```ts
import { calculatePaymentAmount, isEquipmentChargeable, isSamePricedSelection } from '@/lib/pricing'
import { usePricingForDate } from '@/hooks/usePricing'
```

2. Add to `AdminBookingInitialValues`:

```ts
  amount: number | null // Stored payment_amount; kept if the priced selection doesn't change
```

3. Replace the `const equipmentChargeable = …` and `const total = useMemo(…)` blocks with:

```ts
  const { rules, error: pricingError } = usePricingForDate(date)
  const equipmentChargeable = rules ? isEquipmentChargeable(rules, date) : false

  const keepsStoredPrice =
    !!initialValues &&
    initialValues.amount !== null &&
    isSamePricedSelection(
      {
        date: initialValues.date,
        timeSlots: initialValues.timeSlots,
        paddles: initialValues.paddles,
        needsBalls: initialValues.needsBalls,
        trainingBalls: initialValues.trainingBalls,
      },
      { date, timeSlots: selectedSlots, paddles, needsBalls, trainingBalls }
    )

  const total = useMemo(() => {
    if (selectedSlots.length === 0) return 0
    if (keepsStoredPrice) return initialValues!.amount as number
    if (!rules) return null
    return calculatePaymentAmount(rules, selectedSlots, 2, { date, paddles, needsBalls, trainingBalls })
  }, [selectedSlots, date, paddles, needsBalls, trainingBalls, rules, keepsStoredPrice, initialValues])
```

4. (Passing `rules` to `<EquipmentSelector>` happens in Task 11, which adds that prop.)

5. Replace the Total block with:

```tsx
          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">
              Total
              {keepsStoredPrice && <span className="block text-xs text-gray-500">Original price kept</span>}
            </span>
            <span className="text-xl font-bold text-indigo-700">
              {total === null ? (pricingError ? 'Prices unavailable' : '…') : `₱${total.toLocaleString()}`}
            </span>
          </div>
```

6. On the Save button change `disabled={isSubmitting}` to `disabled={isSubmitting || total === null}`.

- [ ] **Step 6: Pass the stored amount when editing**

In `src/app/admin/page.tsx` `handleEditBooking`, add after `trainingBalls: …,`:

```ts
      amount: group.payment_amount ?? null,
```

- [ ] **Step 7: Type-check, test, commit**

Run: `npx tsc --noEmit && npm test` → no errors / PASS.

```bash
git add src/lib/bookingService.ts src/components/admin/AdminBookingForm.tsx src/app/admin/page.tsx
git commit -m "feat(pricing): price admin bookings from the schedule, keep price on unchanged edits"
```

---

### Task 9: Cancellation fees use the booking's snapshot

**Files:**
- Modify: `src/lib/bookingService.ts`, `src/components/profile/BookingHistory.tsx`, `src/lib/__tests__/bookingService.test.ts:6`
- Delete: `src/lib/constants.ts`

- [ ] **Step 1: Service**

In `src/lib/bookingService.ts`:
1. Delete `import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from './constants'` (line 13) and the re-export `export { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT }` (line 30).
2. Extend the `./pricing` import: `import { calculatePaymentAmount, isSamePricedSelection, calculateCancellationFee, rulesFromSnapshot } from './pricing'`.
3. Delete the exported `calculateCancellationFee` function (and its doc comment, ~lines 1036–1055).
4. Delete `canCancelBooking` (~lines 922–932) and the deprecated `cancelBooking` (~line 985 to the end of that function). Verify first: `grep -rn "canCancelBooking\|cancelBooking(" src | grep -v "src/lib/bookingService.ts"` → expected: no output (Plan 1 removed `cancelBookingAction`). If anything is printed, stop and report.
5. In `cancelBookingGroup`, replace the fee calculation with:

```ts
  // Calculate cancellation fee and refund with the prices this booking was made under
  const totalAmount = firstBooking.payment_amount || 0
  const numberOfSlots = bookings.length
  const { cancellationFee, refundAmount } = calculateCancellationFee(
    rulesFromSnapshot(firstBooking.pricing_snapshot),
    totalAmount,
    numberOfSlots,
    hoursUntilBooking
  )
```

- [ ] **Step 2: `BookingHistory.tsx` preview matches the server**

1. Replace `import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from '@/lib/constants'` with `import { calculateCancellationFee, rulesFromSnapshot } from '@/lib/pricing'`.
2. Delete the local `calculateCancellationFee` function (~lines 115–127).
3. Add to the `BookingGroup` interface:

```ts
  cancellationWindowHours: number
  cancellationFeePerSlot: number
```

4. In `groupBookings`, replace the fee block with:

```ts
    // Cancellation terms this booking was made under
    const rules = rulesFromSnapshot(first.pricing_snapshot)
    const totalAmount = first.payment_amount || 0
    const { cancellationFee, refundAmount } = calculateCancellationFee(
      rules,
      totalAmount,
      sorted.length,
      hoursUntilBooking
    )
```

and add to the returned object:

```ts
      cancellationWindowHours: rules.cancellation_window_hours,
      cancellationFeePerSlot: rules.cancellation_fee_per_slot,
```

5. In `CancelConfirmModal`: `const isFreeCancel = group.hoursUntilBooking > group.cancellationWindowHours` and replace `x P{CANCELLATION_FEE_PER_SLOT}` with `x P{group.cancellationFeePerSlot}`.

- [ ] **Step 3: Retire `constants.ts`**

1. In `src/lib/__tests__/bookingService.test.ts` replace line 6 with:

```ts
import { SEED_PRICING_RULES } from '../pricing'

const CANCELLATION_HOURS_BEFORE = SEED_PRICING_RULES.cancellation_window_hours
const CANCELLATION_FEE_PER_SLOT = SEED_PRICING_RULES.cancellation_fee_per_slot
```

2. Check remaining importers: `grep -rn "lib/constants\|from './constants'\|from '../constants'" src`. Expected: only `src/lib/agent/prompt.ts` (handled in Task 12). Leave `src/lib/constants.ts` in place until Task 12, which deletes it.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm test && npx tsx src/lib/__tests__/bookingService.test.ts`
Expected: no type errors, vitest PASS, the tsx script prints all assertions passing.

```bash
git add src/lib/bookingService.ts src/components/profile/BookingHistory.tsx src/lib/__tests__/bookingService.test.ts
git commit -m "feat(pricing): cancellation fees use the booking's price snapshot"
```

---

### Task 10: Finance equipment revenue uses snapshots

**Files:**
- Modify: `src/lib/financeUtils.ts:1-10, 664-711`
- Create: `src/lib/financeUtils.test.ts`

- [ ] **Step 1: Failing test**

`src/lib/financeUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calculateEquipmentBreakdown } from './financeUtils'
import { SEED_PRICING_RULES } from './pricing'
import type { Booking } from '@/types/booking'

function booking(over: Partial<Booking>): Booking {
  return {
    id: 'b', name: 'N', phone: '', email: '', date: '2026-12-01', time_slot: '08:00-09:00',
    court_number: 1, created_at: '2026-11-01T00:00:00Z', players: 2, payment_status: 'confirmed',
    booking_group_id: 'g', paddles_count: 0, needs_balls: false, training_balls: false, ...over,
  }
}

describe('calculateEquipmentBreakdown', () => {
  it('uses the prices saved on each booking', () => {
    const rules = { ...SEED_PRICING_RULES, paddle_price: 80, ball_set_price: 40 }
    const result = calculateEquipmentBreakdown([
      booking({ booking_group_id: 'g1', paddles_count: 2, needs_balls: true, pricing_snapshot: { version_id: 'v2', rules } }),
    ])
    expect(result.paddleRevenue).toBe(160)
    expect(result.ballSetRevenue).toBe(40)
  })

  it('uses seed prices for legacy rows without a snapshot', () => {
    const result = calculateEquipmentBreakdown([booking({ paddles_count: 2, training_balls: true })])
    expect(result.paddleRevenue).toBe(100)
    expect(result.trainingBallsRevenue).toBe(100)
  })

  it('counts nothing for play dates before the snapshot\'s charge start date', () => {
    const result = calculateEquipmentBreakdown([booking({ date: '2026-05-15', paddles_count: 2 })])
    expect(result.paddlesRented).toBe(2)
    expect(result.totalEquipmentRevenue).toBe(0)
  })

  it('counts a multi-slot order once', () => {
    const result = calculateEquipmentBreakdown([
      booking({ id: 'a', time_slot: '08:00-09:00', paddles_count: 1 }),
      booking({ id: 'b', time_slot: '09:00-10:00', paddles_count: 1 }),
    ])
    expect(result.paddleRevenue).toBe(50)
  })
})
```

Run: `npx vitest run src/lib/financeUtils.test.ts` → Expected: the first test FAILS (revenue uses the constant ₱50).

- [ ] **Step 2: Implement**

In `src/lib/financeUtils.ts` replace the import block from `./paymentConfig` with:

```ts
import { EVENING_START_HOUR, LATE_NIGHT_START_HOUR } from './paymentConfig'
import { isEquipmentChargeable, rulesFromSnapshot } from './pricing'
```

In `calculateEquipmentBreakdown`, replace the revenue block with:

```ts
    // Price with what this order was actually charged (seed prices for legacy rows)
    const rules = rulesFromSnapshot(b.pricing_snapshot)
    if (isEquipmentChargeable(rules, b.date)) {
      paddleRevenue += paddles * rules.paddle_price
      if (hasBalls) ballSetRevenue += rules.ball_set_price
      if (hasTraining) trainingBallsRevenue += rules.training_balls_price
    }
```

and update its doc comment's last sentence to: `Revenue uses each order's saved prices (pricing_snapshot) and applies only to play dates on/after that snapshot's equipment charge start date.`

- [ ] **Step 3: Test and commit**

Run: `npm test` → PASS.

```bash
git add src/lib/financeUtils.ts src/lib/financeUtils.test.ts
git commit -m "feat(pricing): finance equipment revenue uses each booking's saved prices"
```

---

### Task 11: Customer-facing price displays

**Files:**
- Modify: `src/components/booking/EquipmentSelector.tsx`, `src/components/booking/BookingForm.tsx`, `src/components/admin/AdminBookingForm.tsx`, `src/components/home/RatesPolicies.tsx`, `src/components/ui/BookingConfirmedModal.tsx`, `src/app/admin/ui/BookingsTable.tsx`

- [ ] **Step 1: `EquipmentSelector` takes rules**

1. Replace `import { PADDLE_PRICE, BALL_SET_PRICE, TRAINING_BALLS_PRICE, MAX_PADDLES } from '@/lib/paymentConfig'` with:

```ts
import { MAX_PADDLES } from '@/lib/paymentConfig'
import type { PricingRules } from '@/types/pricing'
```

2. Add to `EquipmentSelectorProps`:

```ts
  /** Prices for the selected play date (null while loading). */
  rules: PricingRules | null
```

3. Add `rules,` to the destructured props and replace the three label constants with:

```ts
  const price = (n: number | undefined) => (n === undefined ? '…' : `Php${n}`)
  const paddleLabel = chargeable ? `${price(rules?.paddle_price)} each` : 'FREE (promo)'
  const ballLabel = chargeable ? `${price(rules?.ball_set_price)} / set of 4` : 'FREE (promo)'
  const trainingBallsLabel = chargeable
    ? `${price(rules?.training_balls_price)} / booking · with movable basket`
    : 'FREE (promo) · with movable basket'
```

4. In `AdminBookingForm.tsx` add `rules={rules}` to `<EquipmentSelector … />` (the deferred sub-step from Task 8).

- [ ] **Step 2: `BookingForm` uses schedule prices**

1. Replace `import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/paymentConfig'` with:

```ts
import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/pricing'
import { usePricingForDate } from '@/hooks/usePricing'
```

2. Replace the block from `// Paddles & balls are free during the promo…` through `const formattedTotal = …` with:

```ts
  // Prices for the selected play date (versioned by the admin Pricing tab)
  const { rules, error: pricingError } = usePricingForDate(selectedDate)
  const equipmentChargeable = rules ? isEquipmentChargeable(rules, selectedDate) : false

  // Estimate only: the payment screen shows the server-signed amount
  const totalCost = rules
    ? calculatePaymentAmount(rules, selectedSlots.length > 0 ? selectedSlots : ['12:00'], 2, {
        date: selectedDate,
        paddles,
        needsBalls,
        trainingBalls,
      })
    : null
  const formattedTotal =
    totalCost === null ? (pricingError ? 'prices unavailable' : '…') : `Php${totalCost.toLocaleString()}`
```

3. Add `rules={rules}` to `<EquipmentSelector … />`, and change the submit button to `disabled={isSubmitting || !rules}`.

- [ ] **Step 3: `RatesPolicies` reads the schedule**

Replace `src/components/home/RatesPolicies.tsx` from the top of the file through the closing `</div>` of the **Equipment Rental Card** (i.e. the whole left column), and the two cancellation `<li>` items, as follows. Everything else in the file (right column cards, footer note) stays as is.

Top of file:

```tsx
'use client'

import { format, parseISO } from 'date-fns'
import { Sun, Moon, Stars, CalendarX2, UserX, Package, Clock, RefreshCw, CalendarClock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePricingVersions } from '@/hooks/usePricing'
import { describeTierHours, pickPricingVersion, upcomingPricingVersions, RATE_TIER_LABELS } from '@/lib/pricing'
import { manilaNow } from '@/lib/agent/dates'
import type { RateTier } from '@/types/pricing'

const TIER_CARDS: { tier: RateTier; title: string; icon: LucideIcon; gradient: string; iconClass: string; iconStyle: React.CSSProperties }[] = [
  { tier: 'daytime', title: 'Daytime Rate', icon: Sun, gradient: 'from-emerald-500 to-teal-600', iconClass: 'animate-spin', iconStyle: { animationDuration: '6s' } },
  { tier: 'offpeak', title: 'Off-Peak Rate', icon: Moon, gradient: 'from-emerald-600 to-teal-700', iconClass: 'animate-pulse', iconStyle: { animationDuration: '3s' } },
  { tier: 'latenight', title: 'Late Night Rate', icon: Stars, gradient: 'from-emerald-700 to-teal-900', iconClass: 'animate-pulse', iconStyle: { animationDuration: '3s' } },
]

const formatDate = (d: string) => format(parseISO(d), 'MMMM d, yyyy')

export default function RatesPolicies() {
  const { data: versions, isError } = usePricingVersions()
  const today = manilaNow().date
  const current = versions ? pickPricingVersion(versions, today) : null
  const next = versions ? upcomingPricingVersions(versions, today)[0] : undefined
  const rules = current?.rules
  const tierHours = rules ? describeTierHours(rules) : null
  const amount = (n: number | undefined) => (n === undefined ? (isError ? '—' : '…') : n.toLocaleString())
  const equipmentStart = rules?.equipment_charge_start_date
```

`import type React from 'react'` is not needed (React types are global in this project's TSX); if `tsc` complains about `React.CSSProperties`, add `import type { CSSProperties } from 'react'` and use `CSSProperties`.

Left column (replaces the three rate cards and the equipment card):

```tsx
          {/* Left Column - Rates + Equipment */}
          <div className="flex flex-col space-y-4 h-full">
            {next && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
                <CalendarClock className="w-5 h-5 shrink-0 text-amber-600" />
                <p>
                  <span className="font-semibold">New rates for play dates from {formatDate(next.effective_from)}:</span>{' '}
                  {(['daytime', 'offpeak', 'latenight'] as RateTier[])
                    .map((t) => `${RATE_TIER_LABELS[t]} Php${next.rules.tier_prices[t]}`)
                    .join(' · ')}
                </p>
              </div>
            )}

            {TIER_CARDS.filter(({ tier }) => !tierHours || tierHours[tier]).map(({ tier, title, icon: Icon, gradient, iconClass, iconStyle }) => (
              <div key={tier} className="rounded-2xl overflow-hidden shadow-lg flex flex-col flex-1">
                <div className={`bg-gradient-to-br ${gradient} p-5 text-white flex-1 flex items-center`}>
                  <div className="flex gap-4 items-center w-full">
                    <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center shrink-0 w-16 h-16">
                      <Icon className={`w-10 h-10 ${iconClass}`} style={iconStyle} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold">{title}</h3>
                      {tierHours && <p className="text-white/80 text-sm">({tierHours[tier]})</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm">Php</span>
                      <span className="text-4xl font-bold ml-1">{amount(rules?.tier_prices[tier])}</span>
                      <span className="text-lg">/hr</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Equipment Rental Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-emerald-50 rounded-full flex items-center justify-center h-11 w-11 shrink-0">
                  <Package className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Equipment Rental</h3>
                  {equipmentStart && equipmentStart > today && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Effective {formatDate(equipmentStart)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.paddle_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Paddle <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.ball_set_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Balls, set of 4 <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.training_balls_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Training balls, set of 50 <span className="text-gray-500">(per booking, w/ movable basket)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
```

Cancellation list items (replace the two `<li>`):

```tsx
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-600">Free</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancel {amount(rules?.cancellation_window_hours)} hours before booking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-amber-600">P{amount(rules?.cancellation_fee_per_slot)}/hour</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancellation within {amount(rules?.cancellation_window_hours)} hours</span>
                  </li>
```

- [ ] **Step 4: Legacy-row fallbacks use seed prices explicitly**

`src/components/ui/BookingConfirmedModal.tsx`: replace `import { calculatePaymentAmount } from '@/lib/paymentConfig'` with `import { calculatePaymentAmount, SEED_PRICING_RULES } from '@/lib/pricing'` and the fallback call with:

```ts
                              // Legacy rows without a stored amount predate admin pricing
                              const totalCost = calculatePaymentAmount(SEED_PRICING_RULES, timeSlots, players)
```

`src/app/admin/ui/BookingsTable.tsx`: change the import to `import { formatEquipmentSummary } from '@/lib/paymentConfig'` plus `import { calculatePaymentAmount, SEED_PRICING_RULES } from '@/lib/pricing'`, and the fallback to:

```ts
                          // Legacy rows without a stored amount predate admin pricing
                          const total = calculatePaymentAmount(SEED_PRICING_RULES, group.timeSlots, players)
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → clean.

```bash
git add src/components/booking/EquipmentSelector.tsx src/components/booking/BookingForm.tsx src/components/admin/AdminBookingForm.tsx src/components/home/RatesPolicies.tsx src/components/ui/BookingConfirmedModal.tsx src/app/admin/ui/BookingsTable.tsx
git commit -m "feat(pricing): show schedule prices on booking form, rates section and admin form"
```

---

### Task 12: Assistant reads live prices

**Files:**
- Create: `src/lib/agent/pricingNote.ts`, `src/lib/agent/pricingNote.test.ts`
- Modify: `src/lib/agent/prompt.ts`, `src/lib/agent/prompt.test.ts`, `src/app/api/admin/agent/route.ts`
- Delete: `src/lib/constants.ts`

- [ ] **Step 1: Failing tests**

`src/lib/agent/pricingNote.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPricingNote } from './pricingNote'
import { SEED_PRICING_RULES } from '@/lib/pricing'
import type { PricingVersion } from '@/types/pricing'

const v = (over: Partial<PricingVersion>): PricingVersion => ({
  id: 'v', effective_from: '2000-01-01', rules: SEED_PRICING_RULES, created_by: null,
  created_at: '2026-01-01T00:00:00Z', cancelled_at: null, ...over,
})

describe('buildPricingNote', () => {
  it('describes the current prices', () => {
    const note = buildPricingNote([v({})], '2026-11-19')
    expect(note).toContain('daytime ₱200 (6 AM - 6 PM)')
    expect(note).toContain('off-peak ₱250 (5 AM - 6 AM & 6 PM - 10 PM)')
    expect(note).toContain('4 players included; +₱50 per extra player')
    expect(note).toContain('paddles ₱50 each')
    expect(note).toContain('charged for play dates from 2026-06-01')
    expect(note).toContain('within 24 hours of the slot keep a ₱100/slot fee')
  })

  it('lists scheduled changes', () => {
    const dec = v({ id: 'dec', effective_from: '2026-12-01', rules: { ...SEED_PRICING_RULES, tier_prices: { daytime: 220, offpeak: 270, latenight: 320 } } })
    const note = buildPricingNote([v({}), dec], '2026-11-19')
    expect(note).toContain('Scheduled change for play dates from 2026-12-01')
    expect(note).toContain('daytime ₱220')
  })

  it('says prices are unavailable when they could not be loaded', () => {
    expect(buildPricingNote(null, '2026-11-19')).toMatch(/could not be loaded/)
  })
})
```

Replace the first test in `src/lib/agent/prompt.test.ts` and its pricing import:

```ts
import { describe, it, expect } from 'vitest'
import { AGENT_SYSTEM_PROMPT, buildContextNote } from './prompt'
import { manilaNow } from './dates'

describe('prompt', () => {
  it('has no hard-coded prices (they come from the per-request pricing note)', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/₱\d/)
    expect(AGENT_SYSTEM_PROMPT).toContain('pricing note')
  })
```

(keep the other two tests unchanged).

Run: `npx vitest run src/lib/agent` → Expected: FAIL.

- [ ] **Step 2: Implement `src/lib/agent/pricingNote.ts`**

```ts
import type { PricingRules, PricingVersion } from '@/types/pricing'
import { describeTierHours, pickPricingVersion, upcomingPricingVersions } from '@/lib/pricing'

function describeRules(rules: PricingRules): string {
  const hours = describeTierHours(rules)
  const tiers = (
    [
      ['daytime', 'daytime'],
      ['offpeak', 'off-peak'],
      ['latenight', 'late-night'],
    ] as const
  )
    .filter(([tier]) => hours[tier])
    .map(([tier, label]) => `${label} ₱${rules.tier_prices[tier]} (${hours[tier]})`)
    .join('; ')
  const equipmentWhen = rules.equipment_charge_start_date
    ? `charged for play dates from ${rules.equipment_charge_start_date}; free before`
    : 'always charged'

  return [
    `- Rates per slot: ${tiers}.`,
    `- ${rules.base_players_included} players included; +₱${rules.extra_player_charge} per extra player.`,
    `- Equipment per booking (${equipmentWhen}): paddles ₱${rules.paddle_price} each, ball set ₱${rules.ball_set_price}, training balls with basket ₱${rules.training_balls_price}.`,
    `- Cancellations within ${rules.cancellation_window_hours} hours of the slot keep a ₱${rules.cancellation_fee_per_slot}/slot fee.`,
  ].join('\n')
}

/**
 * Per-request pricing context for the assistant (goes after the cache breakpoint).
 * Prices are versioned by PLAY date. Each saved order keeps the amount it was charged.
 */
export function buildPricingNote(versions: PricingVersion[] | null, today: string): string {
  if (!versions) {
    return 'Pricing note: current prices could not be loaded. Do not quote prices; say pricing is unavailable right now.'
  }
  const current = pickPricingVersion(versions, today)
  if (!current) {
    return 'Pricing note: no price version applies today. Do not quote prices.'
  }

  const parts = [`Pricing note (prices apply by play date; in effect since ${current.effective_from}):`, describeRules(current.rules)]
  for (const next of upcomingPricingVersions(versions, today)) {
    parts.push(`Scheduled change for play dates from ${next.effective_from}:`, describeRules(next.rules))
  }
  return parts.join('\n')
}
```

- [ ] **Step 3: Static prompt drops the numbers**

In `src/lib/agent/prompt.ts`:
1. Delete the `@/lib/paymentConfig` import block and the `@/lib/constants` import.
2. Replace the four pricing bullet lines (Rates…, players…, Equipment…, Cancellations…) with:

```
- Prices (slot rates by hour, extra players, equipment, cancellation fee and window) are versioned by play date and set by admins in the Pricing tab. The current version and any scheduled changes are in the pricing note below; always use it. Each order's saved amount is what was actually charged.
```

- [ ] **Step 4: Route adds the note**

In `src/app/api/admin/agent/route.ts`:
1. Add imports:

```ts
import { buildPricingNote } from '@/lib/agent/pricingNote'
import { manilaNow } from '@/lib/agent/dates'
import { getPricingVersions } from '@/lib/pricingService'
import type { PricingVersion } from '@/types/pricing'
```

2. Just before `const result = streamText({`, add:

```ts
  let pricingVersions: PricingVersion[] | null = null
  try {
    pricingVersions = await getPricingVersions()
  } catch {
    pricingVersions = null // The note tells the model prices are unavailable
  }
```

3. Replace `{ role: 'system', content: buildContextNote() },` with:

```ts
      { role: 'system', content: `${buildContextNote()}\n\n${buildPricingNote(pricingVersions, manilaNow().date)}` },
```

- [ ] **Step 5: Delete `src/lib/constants.ts`**

Run: `grep -rn "lib/constants\|from './constants'\|from '../constants'" src` → expected: no output. Then `git rm src/lib/constants.ts`.

- [ ] **Step 6: Test and commit**

Run: `npm test && npx tsc --noEmit` → PASS / clean.

```bash
git add src/lib/agent/pricingNote.ts src/lib/agent/pricingNote.test.ts src/lib/agent/prompt.ts src/lib/agent/prompt.test.ts src/app/api/admin/agent/route.ts
git commit -m "feat(agent): give the assistant live and scheduled prices per request"
```

---

### Task 13: Admin "Pricing" tab

**Files:**
- Create: `src/components/admin/PricingSettings.tsx`
- Modify: `src/hooks/useAdminPage.ts:59`, `src/app/admin/page.tsx`

- [ ] **Step 1: Allow the tab**

In `src/hooks/useAdminPage.ts` line 59, add `'pricing'` to the union:

```ts
  const [activeTab, setActiveTab] = useState<'bookings' | 'slots' | 'closed' | 'payments' | 'settings' | 'refunds' | 'finance' | 'notice' | 'pricing'>('bookings')
```

- [ ] **Step 2: Create `src/components/admin/PricingSettings.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO, addDays } from 'date-fns'
import { Tag, Loader2, Save, CalendarClock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { usePricingVersions, useCreatePricingVersion, useCancelPricingVersion } from '@/hooks/usePricing'
import {
  RATE_TIERS,
  RATE_TIER_LABELS,
  SLOT_START_HOURS,
  diffPricingRules,
  pickPricingVersion,
  upcomingPricingVersions,
  type PricingChange,
} from '@/lib/pricing'
import { pricingRulesSchema } from '@/lib/pricingSchema'
import { manilaNow } from '@/lib/agent/dates'
import type { PricingRules } from '@/types/pricing'

// Form keeps the equipment start date as a string ('' = always charged)
const formSchema = z.object({
  rules: pricingRulesSchema.extend({ equipment_charge_start_date: z.string() }),
  mode: z.enum(['now', 'schedule']),
  effectiveFrom: z.string(),
})
type PricingFormData = z.infer<typeof formSchema>

const formatDate = (d: string) => format(parseISO(d), 'MMM d, yyyy')

function toRules(form: PricingFormData['rules']): PricingRules {
  return { ...form, equipment_charge_start_date: form.equipment_charge_start_date || null }
}

export function PricingSettings() {
  const { data: versions, isLoading, isError } = usePricingVersions()
  const createVersion = useCreatePricingVersion()
  const cancelVersion = useCancelPricingVersion()

  const today = manilaNow().date
  const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  const current = versions ? pickPricingVersion(versions, today) : null
  const upcoming = versions ? upcomingPricingVersions(versions, today) : []

  const [pending, setPending] = useState<{ effectiveFrom: string; rules: PricingRules; changes: PricingChange[] } | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<PricingFormData>({
    resolver: zodResolver(formSchema),
    values: current
      ? {
          rules: { ...current.rules, equipment_charge_start_date: current.rules.equipment_charge_start_date ?? '' },
          mode: 'now',
          effectiveFrom: tomorrow,
        }
      : undefined,
  })
  const mode = watch('mode')

  const onReview = (data: PricingFormData) => {
    if (!current) return
    if (data.mode === 'schedule' && !(data.effectiveFrom >= tomorrow)) {
      setError('effectiveFrom', { message: 'Pick tomorrow or a later date' })
      return
    }
    const rules = toRules(data.rules)
    const changes = diffPricingRules(current.rules, rules)
    if (changes.length === 0) {
      toast.info('No price changes to save')
      return
    }
    setPending({ effectiveFrom: data.mode === 'now' ? today : data.effectiveFrom, rules, changes })
  }

  const onConfirm = async () => {
    if (!pending) return
    try {
      const result = await createVersion.mutateAsync({ effectiveFrom: pending.effectiveFrom, rules: pending.rules })
      if (result.success) {
        toast.success(pending.effectiveFrom === today ? 'New prices are live' : `Price change scheduled for ${formatDate(pending.effectiveFrom)}`)
        setPending(null)
      } else {
        toast.error(result.error || 'Failed to save prices')
      }
    } catch {
      toast.error('Failed to save prices')
    }
  }

  const onCancelUpcoming = async (id: string, date: string) => {
    if (!confirm(`Cancel the price change scheduled for ${formatDate(date)}?`)) return
    const result = await cancelVersion.mutateAsync(id)
    if (result.success) toast.success('Scheduled price change cancelled')
    else toast.error(result.error || 'Failed to cancel')
  }

  const firstError = useMemo(() => {
    const r = errors.rules
    if (!r) return null
    const msgs: string[] = []
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const n = node as { message?: unknown }
      if (typeof n.message === 'string') msgs.push(n.message)
      Object.values(node).forEach((child) => child !== n.message && walk(child))
    }
    walk(r)
    return msgs[0] ?? 'Check the highlighted fields'
  }, [errors.rules])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (isError || !current) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700">
        Prices could not be loaded. Bookings are paused until this is fixed. Check that the pricing migration was applied.
      </div>
    )
  }

  const pesoField = (name: Parameters<typeof register>[0], label: string) => (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-sm text-gray-700">{label}</Label>
      <Input id={name} type="number" min={0} step={1} {...register(name, { valueAsNumber: true })} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Current + upcoming */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-100">
            <Tag className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Prices</h3>
            <p className="text-sm text-gray-500">
              Prices apply by play date. Existing bookings always keep the amount they were charged.
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-700">
          <span className="font-medium">In effect now</span>
          {current.effective_from > '2000-01-01' && <> (since {formatDate(current.effective_from)})</>}:{' '}
          {RATE_TIERS.map((t) => `${RATE_TIER_LABELS[t]} ₱${current.rules.tier_prices[t]}`).join(' · ')}
        </p>

        {upcoming.length > 0 && (
          <ul className="mt-4 space-y-2">
            {upcoming.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
                <span className="flex items-center gap-2 text-amber-900">
                  <CalendarClock className="w-4 h-4" />
                  From {formatDate(v.effective_from)}:{' '}
                  {RATE_TIERS.map((t) => `${RATE_TIER_LABELS[t]} ₱${v.rules.tier_prices[t]}`).join(' · ')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cancelVersion.isPending}
                  onClick={() => onCancelUpcoming(v.id, v.effective_from)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Editor */}
      <form onSubmit={handleSubmit(onReview)} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <section className="space-y-3">
          <h4 className="font-medium text-gray-900">Court rates (per 1-hour slot)</h4>
          <div className="grid grid-cols-3 gap-4">
            {RATE_TIERS.map((t) => (
              <div key={t}>{pesoField(`rules.tier_prices.${t}`, `${RATE_TIER_LABELS[t]} (₱)`)}</div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="font-medium text-gray-900">Rate for each hour</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {SLOT_START_HOURS.map((hour, i) => (
              <label key={hour} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span className="font-mono text-gray-700">{String(hour).padStart(2, '0')}:00</span>
                <select className="bg-transparent text-gray-900" {...register(`rules.hour_tiers.${i}`)}>
                  {RATE_TIERS.map((t) => (
                    <option key={t} value={t}>{RATE_TIER_LABELS[t]}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="font-medium text-gray-900">Players</h4>
          <div className="grid grid-cols-2 gap-4">
            {pesoField('rules.base_players_included', 'Players included')}
            {pesoField('rules.extra_player_charge', 'Each extra player (₱)')}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="font-medium text-gray-900">Equipment (per booking)</h4>
          <div className="grid grid-cols-3 gap-4">
            {pesoField('rules.paddle_price', 'Paddle, each (₱)')}
            {pesoField('rules.ball_set_price', 'Ball set (₱)')}
            {pesoField('rules.training_balls_price', 'Training balls (₱)')}
          </div>
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="equipment_start" className="text-sm text-gray-700">Charge equipment for play dates from</Label>
            <Input id="equipment_start" type="date" {...register('rules.equipment_charge_start_date')} />
            <p className="text-xs text-gray-500">Leave empty to always charge.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="font-medium text-gray-900">Cancellation</h4>
          <div className="grid grid-cols-2 gap-4">
            {pesoField('rules.cancellation_window_hours', 'Free cancellation until (hours before)')}
            {pesoField('rules.cancellation_fee_per_slot', 'Fee per slot inside that window (₱)')}
          </div>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h4 className="font-medium text-gray-900">When should these prices apply?</h4>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="now" {...register('mode')} /> Immediately (play dates from today)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" value="schedule" {...register('mode')} /> From a future play date
          </label>
          {mode === 'schedule' && (
            <div className="max-w-xs">
              <Input type="date" min={tomorrow} {...register('effectiveFrom')} />
              {errors.effectiveFrom && <p className="text-sm text-red-500">{errors.effectiveFrom.message}</p>}
            </div>
          )}
        </section>

        {firstError && <p className="text-sm text-red-500">{firstError}</p>}

        <div className="flex justify-end">
          <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600">
            <Save className="w-4 h-4 mr-2" />
            Review changes
          </Button>
        </div>
      </form>

      {/* Confirmation */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPending(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Confirm price change</h3>
              <button type="button" onClick={() => setPending(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              {pending.effectiveFrom === today
                ? 'Applies to play dates from today. '
                : `Applies to play dates from ${formatDate(pending.effectiveFrom)}. `}
              Bookings already made keep their price. Customers already on the payment screen keep the price they were shown.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <tbody>
                  {pending.changes.map((c) => (
                    <tr key={c.label} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 text-gray-700">{c.label}</td>
                      <td className="px-3 py-2 text-gray-400 line-through">{c.from}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)} disabled={createVersion.isPending}>
                Back
              </Button>
              <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600" onClick={onConfirm} disabled={createVersion.isPending}>
                {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

Notes for the implementer:
- `pricingRulesSchema` is a `z.strictObject`; `.extend` keeps strictness — fine, since the form registers exactly those fields.
- If `zodResolver` infers input/output type mismatches (Zod v4 + `@hookform/resolvers`), use `useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>` as in other forms if any; otherwise keep as written and confirm with `tsc`.
- `Parameters<typeof register>[0]` gives the field-path type for `pesoField`; if `tsc` rejects template-literal paths, type `name` as `` `rules.${string}` `` and cast: `register(name as never, …)`.

- [ ] **Step 3: Add the tab to the admin page**

In `src/app/admin/page.tsx`:
1. Add `Tag` to the `lucide-react` import and `import { PricingSettings } from '@/components/admin/PricingSettings'`.
2. After the "Payment Settings" tab button, add:

```tsx
            <Button
              variant={table.activeTab === 'pricing' ? 'default' : 'outline'}
              onClick={() => table.setActiveTab('pricing')}
              className={table.activeTab === 'pricing' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              <Tag className="w-4 h-4 mr-2" />
              Pricing
            </Button>
```

3. After the `{table.activeTab === 'settings' && (…)}` block, add:

```tsx
          {table.activeTab === 'pricing' && (
            <div className="space-y-6">
              <PricingSettings />
            </div>
          )}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → clean.

```bash
git add src/components/admin/PricingSettings.tsx src/hooks/useAdminPage.ts src/app/admin/page.tsx
git commit -m "feat(admin): add Pricing tab with immediate and scheduled price changes"
```

---

### Task 14: Remove legacy price constants, docs, full verification

**Files:**
- Modify: `src/lib/paymentConfig.ts`, `src/lib/pricing.test.ts`, `CLAUDE.md`

- [ ] **Step 1: Drop the seed-vs-legacy test**

In `src/lib/pricing.test.ts` delete `import * as legacy from './paymentConfig'`, the whole `describe('seed rules', …)` block, and the `it('matches the legacy function for the seed rules', …)` test.

- [ ] **Step 2: Strip prices from `paymentConfig.ts`**

Delete these exports and their comments: `DAYTIME_PRICE_PER_SLOT`, `EVENING_PRICE_PER_SLOT`, `LATE_NIGHT_PRICE_PER_SLOT`, `EARLY_MORNING_END_HOUR`, `EXTRA_PLAYER_CHARGE`, `BASE_PLAYERS_INCLUDED`, `PADDLE_PRICE`, `BALL_SET_PRICE`, `TRAINING_BALLS_PRICE`, `EQUIPMENT_CHARGE_START_DATE`, `PRICE_PER_SLOT`, `RateTier`, `getSlotRateTier`, `isPremiumSlot`, `isEveningSlot`, `getPriceForSlot`, `EquipmentSelection`, `isEquipmentChargeable`, `calculateEquipmentCharge`, `calculatePaymentAmount`, `calculatePaymentAmountLegacy`.

Keep: `MAX_PADDLES`, `DEFAULT_PAYMENT_TIMEOUT_MINUTES`, the status arrays, `getSlotStartHour`, `formatEquipmentSummary`, the deadline/remaining-time helpers, and these two with a new comment:

```ts
// Finance "time of day" reporting bands (labels only; prices come from the pricing schedule)
export const EVENING_START_HOUR = 18           // 6:00 PM
export const LATE_NIGHT_START_HOUR = 22        // 10:00 PM
```

Update the file header comment to: `Payment settings and helpers. Prices are NOT here: they live in the pricing_schedules table (see lib/pricing.ts).`

- [ ] **Step 3: Nothing references removed names**

Run:

```bash
grep -rnE "DAYTIME_PRICE_PER_SLOT|EVENING_PRICE_PER_SLOT|LATE_NIGHT_PRICE_PER_SLOT|EARLY_MORNING_END_HOUR|EXTRA_PLAYER_CHARGE|BASE_PLAYERS_INCLUDED|PADDLE_PRICE|BALL_SET_PRICE|TRAINING_BALLS_PRICE|EQUIPMENT_CHARGE_START_DATE|PRICE_PER_SLOT|calculatePaymentAmountLegacy|isPremiumSlot|CANCELLATION_FEE_PER_SLOT|CANCELLATION_HOURS_BEFORE" src
grep -rn "from '@/lib/paymentConfig'\|from './paymentConfig'" src | grep -E "calculatePaymentAmount|isEquipmentChargeable|getPriceForSlot|calculateEquipmentCharge|getSlotRateTier"
```

Expected: the only hits are the two local `const CANCELLATION_*` lines in `src/lib/__tests__/bookingService.test.ts`. Anything else must be migrated to `@/lib/pricing`.

- [ ] **Step 4: Update `CLAUDE.md`**

Replace the `### Pricing (from \`lib/paymentConfig.ts\`)` section with:

```markdown
### Pricing (admin-managed, `pricing_schedules`)

- Prices are versioned rows in `pricing_schedules` (`sql/pricing-schedules-migration.sql`, service role only). A booking uses the newest non-cancelled version with `effective_from <= play date` (Manila); same-day ties → newest `created_at`. Rows are never edited; upcoming ones can be cancelled. Seed row (2000-01-01) = the original prices.
- Editable in the admin **Pricing** tab (`components/admin/PricingSettings.tsx`): 3 tier prices + tier per hour (19 slots), extra-player charge + players included, paddle/ball set/training balls, equipment charge start date, cancellation fee per slot + free-cancellation window. Apply now (effective today) or schedule (tomorrow+), with an old → new confirmation.
- All math is in `lib/pricing.ts` (pure, client + server) and takes the version's `PricingRules`. Never hardcode a price; `paymentConfig.ts` holds no prices.
- Payment screen: `getPriceQuoteAction` returns an HMAC-signed quote (`lib/priceQuote.ts`, env `PRICE_QUOTE_SECRET`, 60 min). `submitPaymentAction` verifies it and saves exactly `quote.amount`; invalid/expired → `code: 'quote_invalid'` and the UI refetches the quote.
- Each booking row stores `payment_amount` and `pricing_snapshot` (`{ version_id, rules }`). Cancellation fees and Finance equipment revenue use the snapshot (`rulesFromSnapshot`; seed prices for legacy rows). Emails use the stored amount.
- If prices can't be loaded, quotes and bookings fail ("Prices are unavailable…") — never ₱0, never a constant fallback.
- Query key `['pricing']` (all active versions; invalidated by the Pricing tab).
- The assistant gets a per-request pricing note (`lib/agent/pricingNote.ts`); the static prompt has no numbers.
```

Also add under the query key list: ``- `['pricing']` — active price versions; `['priceQuote', input]` — signed quote on the payment screen (gcTime 0)``.

- [ ] **Step 5: Full automated check**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. `npx tsx src/lib/__tests__/bookingService.test.ts` also passes.

- [ ] **Step 6: Manual test (local, port 3001; local DB = production)**

Prereqs: Task 1 SQL applied, `PRICE_QUOTE_SECRET` in `.env.local`.
Run: `env -u ANTHROPIC_API_KEY npm run dev -- -p 3001`

Read-only checks (safe on production data):
1. `/` signed out: Rates section shows ₱200 / ₱250 / ₱300, hours "6 AM - 6 PM", "5 AM - 6 AM & 6 PM - 10 PM", "10 PM - 12 AM", equipment ₱50/₱25/₱100, cancellation "24 hours" / "P100/hour" — identical to before.
2. Pick a date + slot: the Book button total matches the old total for the same selection.
3. Click Book → payment screen shows the amount (spinner first, then ₱…). Close it without submitting.
4. `/admin` → Pricing tab: current prices load, the hour grid matches. Change the daytime rate, choose "From a future play date", pick a date → Review shows exactly one change → **Back** (do not confirm).
5. Finance tab equipment revenue matches the value before this branch.

Write-path checks (creating a version, submitting a booking with a quote, cancelling) must be done on a **Vercel preview deployment pointed at a non-production database**, or by the owner on production with their explicit go-ahead. Ask before doing any of them.

- [ ] **Step 7: Commit**

```bash
git add src/lib/paymentConfig.ts src/lib/pricing.test.ts CLAUDE.md
git commit -m "refactor(pricing): remove hardcoded price constants, document admin pricing"
```

---

## Self-review notes

- **Spec coverage:** all editable fields (Task 2 types / Task 3 schema / Task 13 UI); versions by play date + immediate/scheduled + immutability + cancel upcoming (Tasks 1, 2, 4, 6, 13); seed (Task 1); fail closed (Tasks 4, 6, 7, 8; no constant fallback except legacy snapshots); signed quote (Tasks 5–7); snapshot (Tasks 1, 7, 8); cancellation (Task 9); Finance (Task 10); admin edit keeps price (Task 8); every display (Task 11); assistant (Task 12); docs (Task 14).
- **Ordering:** each task leaves the app working. Until Task 14, the old constants coexist with the seed (a test proves they're equal), so un-migrated screens show the same numbers.
- **Out of scope noticed:** none blocking.
