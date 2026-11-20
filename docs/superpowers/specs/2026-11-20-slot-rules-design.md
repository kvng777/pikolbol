# Slot Rules: Design

Date: 2026-11-20 · Status: approved in conversation, pending written-spec review

## Problem

Admins block time slots one slot, one date at a time (Time Slots tab, `disabled_slots`). Recurring blocks (daily open play), one-off range blocks (a tournament week) and opening-hour changes mean many clicks and are easy to get wrong. Single-day blocks are also only enforced by the booking UI: the server does not re-check them when a booking is submitted.

## Goals

- One rule type that covers recurring blocks, one-off range blocks and opening hours (within the existing 5 AM–12 AM window).
- Blocked slots are enforced on the server for every booking path.
- Customers see why a slot is unavailable.

## Non-goals

Per-rule pricing, partial-hour blocks, hours outside 5 AM–12 AM (keep the design extendable), replacing the existing one-day blocker or Closed Dates.

## Rule model

New table `slot_rules` (`sql/slot-rules-migration.sql`, additive, RLS on with no policies, service role only):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `label` | text null | Optional, ≤ 30 chars. Customers see it on blocked slots; empty → "Blocked" |
| `start_date` | date not null | First play date (Asia/Manila) |
| `end_date` | date null | Inclusive; null = no end. Must be ≥ `start_date` |
| `weekdays` | smallint[] not null | ISO weekday 1 (Mon) … 7 (Sun); at least one |
| `time_slots` | text[] not null | Subset of `generateTimeSlots()` (`"07:00-08:00"` format); at least one |
| `created_by` | uuid null | Admin user id; never returned to public callers |
| `created_at`, `updated_at` | timestamptz | |

A slot on date D is blocked by a rule if `start_date ≤ D`, (`end_date` is null or `D ≤ end_date`), weekday(D) ∈ `weekdays`, and the slot ∈ `time_slots`. Rules can be edited (all fields), ended ("End" on a rule that starts today or later deletes it, since the DB requires end ≥ start; otherwise it sets `end_date` to Manila yesterday and keeps the row) or deleted. Rules carry no money, so unlike pricing versions they are mutable.

Examples:
- Recurring: "Open Play", every day, 07:00–11:00, from Nov 20, no end.
- Range once: "Tournament", every day, chosen slots, Dec 5–7.
- Opening hours: "Closed", every day, 05:00–06:00, from Dec 1, no end (opens at 6 AM).

Availability = not booked (pending/confirmed) AND not in `disabled_slots` AND date not in `closed_dates` AND not blocked by any rule.

## Components

- **`src/lib/slotRules.ts`** (pure, client + server): rule type, `isSlotBlockedByRules(rules, date, slot)` → matching rule or null, `ruleLabel(rule)` ("Blocked" default), `describeRule(rule)` for summaries (e.g. "7–11 AM every day from Nov 20"), Manila weekday helper. Unit-tested.
- **Zod schema** for rule input (dates real, end ≥ start, weekdays 1–7 non-empty and unique, slots from `generateTimeSlots()` non-empty and unique, label trimmed ≤ 30 or empty → null).
- **`src/lib/slotRulesService.ts`** (server): list, create, update, end, delete; `findBookingsOverlappingRule(input)` returns active bookings (short id, date, slot, name) inside the rule's range/weekdays/slots. Read errors throw (fail closed).
- **`src/lib/slotAvailability.ts`** (server): `getBlockedSlots(date, slots)` combining rules, `disabled_slots` and `closed_dates`; used by every booking write path.
- **Actions** (`src/actions/slotRules.ts`): public `getSlotRulesAction` (no `created_by`); admin `createSlotRuleAction`, `updateSlotRuleAction`, `endSlotRuleAction`, `deleteSlotRuleAction`, `previewSlotRuleOverlapAction`, all `requireAdmin` first and listed in `actionGuards.test.ts`.
- **Hook** `useSlotRules` (query key `['slotRules']`, refetched every few minutes and invalidated on admin changes).

## Where it is used

- **Slot display** (`getAvailableSlotsForCourt` and callers: booking page, reschedule modal, admin booking form, Today summary): takes the rules; a rule-blocked slot is unavailable with `reason: 'rule'` and its label. `TimeSlot` gains `reason: 'rule'` and optional `label`. Customer UI shows the label (or "Blocked") on the greyed slot. If rules fail to load, the customer booking UI shows "Availability unavailable, please try again" rather than allowing selection.
- **Server enforcement** (all reject with "One or more selected slots are no longer available" and save nothing):
  - `submitPaymentAction` (customer booking)
  - `createRescheduleRequestAction` (customer request) and `approveRescheduleRequest` (admin approval)
  - `createAdminBooking` / `updateAdminBooking`, unless the admin passes an explicit `overrideBlocks: true` (set only after the UI confirmation "This slot is blocked by '<label>' — book anyway?"). Customers can never override.
  
  The check covers rules, single-day blocks and closed dates, which also closes the existing single-day gap.
- **Admin Time Slots tab**: new "Rules" section above the existing one-day blocker.
  - List: label (or "Blocked"), days, times, dates, status (Active / Starts <date> / Ended), with Edit, End, Delete (confirm dialogs).
  - Form: optional label; weekday buttons with "Every day / Weekdays / Weekends" shortcuts; 19-slot grid (tap and drag-select); start date; end date or "No end date".
  - Save review: plain-language summary plus overlapping existing bookings (ID, date, time, name). The rule saves anyway; those bookings stay valid for the admin to handle manually.
- **Assistant**: `getSlotAvailability` reports rule-blocked slots with their label.

## Error handling

- Rule reads fail closed on booking writes (reject) and in the customer UI (no selection).
- Admin inputs are validated with the shared schema on client and server; server is authoritative.
- Overlap list is computed on the server from pending + confirmed bookings.

## Testing

- `slotRules.ts`: weekday matching, start/end edges, no end date, Manila dates around midnight UTC, default label, summaries.
- Schema: invalid dates, end < start, empty/duplicate weekdays or slots, unknown slots, long label.
- Server enforcement: blocked slot rejected for customer submit, reschedule request/approval and admin booking; admin override only with the flag; single-day block and closed date also rejected.
- Admin actions guarded (`actionGuards.test.ts`); public list has no `created_by`.
- Overlap query returns the right bookings.

## Rollout

1. Run `sql/slot-rules-migration.sql` in production (additive; current code ignores the table).
2. Deploy. No new env vars.
