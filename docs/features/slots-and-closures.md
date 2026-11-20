# Slots & Closures
Which 1-hour slots exist and which are available: bookings, slot rules, admin one-day blocks, closed date ranges and reschedule holds.

## Key files
- `src/lib/timeSlotGenerator.ts` — `generateTimeSlots()` (05:00–24:00, 19 slots, `"HH:00-HH:00"`), `getAvailableSlotsForCourt()` (takes `rules`), `customerVisibleSlots()`
- `src/lib/slotRules.ts` — pure rule logic: `findBlockingRule`, `ruleLabel`, `isRuleHidden`, `isSameSlotSelection`, wording helpers
- `src/lib/slotRulesSchema.ts` (Zod input), `src/lib/slotRulesService.ts` (CRUD, `getSlotRulesForDate`, overlap query; fails closed)
- `src/lib/slotAvailability.ts` — `findBlockedSlots(date, slots)`: rules + one-day blocks + closed dates, used by every booking write path
- `src/actions/slotRules.ts`, `src/hooks/useSlotRules.ts` — public `getCurrentSlotRulesAction` + admin actions/hooks
- `src/components/admin/SlotRulesSection.tsx` + `SlotRuleForm.tsx` — Rules section in the Time Slots tab
- `src/lib/bookingService.ts` — occupancy, disabled slot + closed date CRUD, `isDateClosed`, held reschedule slots; admin create/update, reschedule request/approval
- `src/actions/bookings.ts`, `src/hooks/useBookings.ts` — public reads, admin block/closure actions
- `src/components/booking/TimeSlotPicker.tsx` (customer-only; drops `hidden` slots), `CalendarPicker.tsx` (hides closed dates)
- `src/lib/agent/summaries.ts` — `summarizeAvailability` for the assistant

## How it works
1. A slot is unavailable when: past (today, now + 30 min buffer), booked/held, in `disabled_slots` for that date, the date is in `closed_dates`, or a `slot_rules` row covers it (date in `[start_date, end_date]`, ISO weekday in `weekdays`, slot in `time_slots`).
2. `getAvailableSlotsForCourt` reasons, in order: `past`, `booked`, `disabled`, `rule`. Customers see a rule-blocked slot greyed with the rule label ("Blocked" if the label is empty).
3. Hide from customers (per rule, `hide_from_customers`, e.g. closed 5–6 AM): its rule-blocked slots get `hidden: true` and `TimeSlotPicker` (booking page, reschedule modal) doesn't render them; if nothing is left it says "No times available". Off (e.g. Open Play) = greyed with the label. The server blocks the slot either way; the admin booking form still shows it (amber, labelled, overridable). With several rules on one slot, only the one `findBlockingRule` picks (first in list order) decides label and hidden. Missing flag (old rows, cached data) = not hidden.
4. Server enforcement: `findBlockedSlots` runs on customer submit, reschedule request + approval, and admin create/update. Admins may send `overrideBlocks === true` (after a "Book anyway" confirmation in `AdminBookingForm`) to book over rules and one-day blocks, never over closed dates. Editing a booking with the same date + slots skips the check (`isSameSlotSelection`).
5. Fail closed: if rules/blocks can't be read, the server refuses the write (`AVAILABILITY_UNAVAILABLE`), the customer UI (booking page, reschedule modal) won't allow selecting slots, and the admin form blocks saving.
6. Admin Rules section (Time Slots tab): list, create, edit, End, Delete; weekday shortcuts, drag-select grid, review step listing existing bookings inside the rule (they stay valid). End sets `end_date` to Manila yesterday; End on a rule starting today or later deletes it. The form has a "Hide these slots from customers" checkbox; the list shows a "Hidden" badge.
7. Admins also block one slot on one date (Time Slots tab) and close date ranges with a reason (Closed Dates tab).
8. Assistant: `summarizeAvailability` returns `blockedByRule` (`{ time, label, hidden? }`); hidden-rule slots are still reported.

## Data
- `slot_rules` (`sql/slot-rules-migration.sql`): `label` (nullable, ≤ 30), `start_date`, `end_date` (nullable, inclusive), `weekdays` smallint[] 1–7, `time_slots` text[], `hide_from_customers` boolean NOT NULL DEFAULT false (`sql/slot-rules-hide-migration.sql`), `created_by`, timestamps; RLS on, service role only.
- `disabled_slots`: `id`, `date`, `time_slot`. `closed_dates`: `start_date`, `end_date`, `reason`.
- `TimeSlot`: `{ time, available, reason?: 'past' | 'booked' | 'disabled' | 'rule', label?, hidden? }`.
- Query keys: `['slotRules']` (customer: active + upcoming), `['slotRules','admin']` (all), `['activeBookings', date]`, `['disabledSlots', date]`, `['allDisabledSlots']`, `['closedDates']`, `['heldRescheduleSlots', date]`.

## Rules (don't break)
- Hiding is display-only: never filter `hidden` slots in admin screens or treat hiding as the block.
- Never check availability only in the UI; every new booking write path must call `findBlockedSlots`.
- Slot strings must come from `generateTimeSlots()`; pricing's 19-hour grid depends on the same list.
- Only `pending` + `confirmed` bookings occupy a slot. Public occupancy reads return slot fields only.
- Rules carry no money and nothing cancels existing bookings.

## Gotchas / known gaps
- `isDateClosed` (calendar/legacy checks) fails open; `findBlockedSlots` fails closed.
- "Today"/past checks in the UI use the browser clock; fine for PH users, not authoritative.
- Operating hours are hardcoded (`OPERATING_HOURS`); changing them also needs the pricing grid.
- Apply `sql/slot-rules-migration.sql`, then `sql/slot-rules-hide-migration.sql`, before deploy: without the table/column, rule reads fail and writes fail closed.
