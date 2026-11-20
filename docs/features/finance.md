# Finance
Admin Finance tab: revenue, refunds, cancellation fees, time/day breakdowns, utilization and equipment revenue, computed client-side from all bookings.

## Key files
- `src/components/admin/FinanceTab.tsx` — tab shell (Refresh, period picker, sections)
- `src/components/admin/FinanceSummaryCards.tsx`, `FinanceCharts.tsx`, `FinanceDailyChart.tsx`, `FinanceCalendarHeatmap.tsx`, `FinanceRevenueTable.tsx`, `FinanceStatistics.tsx`, `FinanceEquipment.tsx` — sections
- `src/hooks/useFinanceData.ts` — period state + memoized calculations over `useAllBookings()`
- `src/lib/financeUtils.ts` — pure calculations (shared with the assistant)
- `src/lib/bookingService.ts` — `getAllBookings()` (paginated), `getBookingsInRange()` (assistant)

## How it works
1. `useAllBookings()` → `getAllBookingsAction(token)` (admin) → `getAllBookings()` pages through all rows 1000 at a time.
2. `useFinanceData` filters by the selected period (`getDateRangeForPeriod`) and computes summaries with `financeUtils`.
3. Gross revenue = sum of `payment_amount` per confirmed group (each group counted once). Refunds = completed `refund_amount`. Fees = `cancellation_fee` on cancelled groups. Net = gross + fees; refunds are shown separately and not subtracted (cancelled groups are already outside gross).
4. Time breakdown uses fixed reporting bands (`EVENING_START_HOUR`, `LATE_NIGHT_START_HOUR` in `paymentConfig.ts`); they label reports only and do not set prices.
5. Equipment breakdown counts rentals per group and prices them from each booking's `pricing_snapshot` (seed rules for legacy rows; malformed snapshot → ₱0 revenue for that group + warning).
6. The assistant's `getRevenueSummary` reuses the same functions over `getBookingsInRange`, so numbers match the tab.

## Data
- Reads `bookings`: `payment_status`, `payment_amount`, `booking_group_id`, `date`, `time_slot`, `cancellation_fee`, `refund_amount`, `refund_status`, equipment fields, `pricing_snapshot`.
- Query key: `['allBookings']` (staleTime 0, refetch on window focus; no polling).

## Rules (don't break)
- Money is per group: dedupe by `booking_group_id || id` before summing.
- Never recompute historical amounts from current prices; use stored `payment_amount` / snapshots.
- Keep calculations in `financeUtils` (pure) so the Finance tab and the assistant agree.

## Gotchas / known gaps
- Everything loads every booking into the browser; fine at current volume, revisit if rows grow large.
- Equipment chargeability uses the booking's current date; a reschedule across the equipment start date can misattribute equipment revenue.
- Period ranges use the browser's local time.
