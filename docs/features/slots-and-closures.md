# Slots & Closures
Which 1-hour slots exist and which are available: bookings, admin one-day slot blocks, closed date ranges and reschedule holds.

Slot rules (recurring/range blocks, opening hours) are planned: see `docs/superpowers/specs/2026-11-20-slot-rules-design.md`.

## Key files
- `src/lib/timeSlotGenerator.ts` — `generateTimeSlots()` (05:00–24:00, 19 slots, `"HH:00-HH:00"`), `getAvailableSlotsForCourt()`
- `src/lib/bookingService.ts` — `getActiveSlotOccupancyByDate`, disabled slot CRUD, closed date CRUD, `isDateClosed`, `getHeldRescheduleSlotsByDate`
- `src/actions/bookings.ts` — public reads (occupancy, disabled slots by date, closed dates, held slots); admin add/remove
- `src/hooks/useBookings.ts` — `useActiveBookingsByDate`, `useDisabledSlotsByDate`, `useClosedDates`, `useAllDisabledSlots`
- `src/components/booking/CalendarPicker.tsx` — hides closed dates
- `src/app/admin/page.tsx` — Time Slots and Closed Dates tabs (state in `src/hooks/useAdminPage.ts` via `src/app/admin/hooks/useAdminTable.ts`)
- `src/lib/agent/summaries.ts` — `summarizeAvailability` for the assistant

## How it works
1. `getAvailableSlotsForCourt(occupancy, date, court, disabledSlots, opts)` marks each slot with a reason, in order: `past` (today and before now + 30 min buffer, unless `ignorePast`), `booked` (active booking or reschedule hold), `disabled` (one-day block).
2. Callers: booking page (`app/page.tsx`), `AdminBookingForm` (ignores past, excludes the group being edited), `RescheduleModal` (adds held slots, excludes own group), assistant summaries.
3. Closed dates are whole days: the calendar hides them and `isDateClosed` is checked server-side on customer submit, manual create/edit and reschedule requests.
4. Admin blocks one slot on one date at a time (Time Slots tab); closed ranges have a reason (Closed Dates tab).

## Data
- `disabled_slots`: `id`, `date`, `time_slot`, `created_at` (no reason).
- `closed_dates`: `id`, `start_date`, `end_date`, `reason`, `created_at`.
- `TimeSlot`: `{ time, available, reason?: 'past' | 'booked' | 'disabled' }`.
- Query keys: `['activeBookings', date]` (30 s), `['disabledSlots', date]`, `['allDisabledSlots']`, `['closedDates']`, `['heldRescheduleSlots', date]`.

## Rules (don't break)
- Slot strings must come from `generateTimeSlots()`; pricing's 19-hour grid (`SLOT_COUNT`, `FIRST_SLOT_HOUR`) and the quote schema depend on the same list.
- Only `pending` + `confirmed` bookings occupy a slot.
- Public occupancy reads return slot fields only (no personal data).

## Gotchas / known gaps
- `submitPaymentAction` does not re-check `disabled_slots` (only closed dates); a one-day block is enforced by the UI only. Reschedule requests do check it.
- "Today"/past checks use the browser's clock and timezone (`date-fns format(now)`); fine for PH users, not authoritative.
- Operating hours are hardcoded (`OPERATING_HOURS` in `timeSlotGenerator.ts`); changing them also needs the pricing grid.
