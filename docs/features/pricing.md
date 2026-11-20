# Pricing
Admin-managed, versioned court prices applied by play date; customers pay exactly a server-signed quote and each booking keeps the prices it was made under.

## Key files
- `src/lib/pricing.ts` — all price math (pure, client + server): tiers, slot price, totals, equipment, cancellation fee, version picking, snapshots, labels
- `src/lib/pricingSchema.ts` — Zod: price rules, new version (`now` / `scheduled`), quote input (real slots only)
- `src/lib/pricingService.ts` — read/create/cancel versions; fails closed (`PricingUnavailableError`, `NoPricesForDateError`)
- `src/lib/priceQuote.ts` — HMAC-signed quotes (`PRICE_QUOTE_SECRET`), verify
- `src/actions/pricing.ts` — public `getPricingVersionsAction` (no `created_by`), `getPriceQuoteAction`; admin create/cancel
- `src/hooks/usePricing.ts` — `usePricingVersions`, `usePricingForDate`, `usePriceQuote`, admin mutations
- `src/components/admin/PricingSettings.tsx` + `src/lib/pricingForm.ts` — admin Pricing tab
- `src/components/home/RatesPolicies.tsx` — public rates + "new rates from…" banner
- `src/lib/agent/pricingNote.ts` — per-request price note for the assistant
- `sql/pricing-schedules-migration.sql` — table, seed row, `bookings.pricing_snapshot`

## How it works
1. A version = `PricingRules`: 3 tier prices, tier of each of the 19 hours (index 0 = 05:00), extra-player charge, players included, paddle / ball set / training balls prices, equipment charge start date (null = always), cancellation fee per slot, free-cancellation window hours.
2. Price for a play date = newest non-cancelled version with `effective_from <= date` (Manila); same-day tie → newest `created_at`.
3. Admin Pricing tab: edit all fields, "Apply now" (server decides Manila today) or "Schedule" (tomorrow … +2 years), old → new confirmation, cancel upcoming versions. Effective rows are never edited.
4. Payment screen: `getPriceQuoteAction` returns `{ amount, versionId, expiresAt, token }` (60 min; screen refreshes at 50 min and toasts if the amount changes). `submitPaymentAction` verifies signature, details and expiry, then saves `quote.amount` + `pricing_snapshot = { version_id, rules }`. Invalid/expired → `code: 'quote_invalid'`, UI fetches a new quote.
5. Manual admin bookings priced from the schedule; reschedules carry the original amount + snapshot.
6. Cancellation fee and Finance equipment revenue use the booking's snapshot (`rulesFromSnapshot`; seed rules for legacy rows without one).

## Data
- `pricing_schedules`: `id`, `effective_from` (date), `rules` (jsonb), `created_by`, `created_at`, `cancelled_at`. RLS on, service role only. Seed row `2000-01-01` = launch prices (`SEED_PRICING_RULES`).
- `bookings.pricing_snapshot` (jsonb, null on pre-pricing rows).
- Query keys: `['pricing']` (versions, invalidated by the tab), `['priceQuote', input]` (gcTime 0).
- Env: `PRICE_QUOTE_SECRET` (server, ≥ 32 chars, required).

## Rules (don't break)
- Never hardcode a price; `paymentConfig.ts` holds no prices. All math goes through `lib/pricing.ts` with a version's rules.
- Fail closed: if prices or the secret are unavailable, quotes/bookings fail and screens show "Prices unavailable". Never ₱0, never a constant fallback.
- Customer pays the quoted amount; the signature covers date, sorted slots, players, equipment, amount, version id, expiry. Court is forced to 1.
- Existing bookings never change price; edits keep the stored price unless date/slots/equipment change.
- Admin actions `requireAdmin` first and are listed in `actionGuards.test.ts`.

## Gotchas / known gaps
- Deploy order: run the migration, set `PRICE_QUOTE_SECRET`, then deploy. Rolling back to pre-pricing code brings back the old hardcoded prices.
- A cancelled version's already-issued quote is honoured until it expires (by design).
- Finance equipment chargeability uses the booking's current date; a reschedule across the equipment start date can misattribute equipment revenue (amount itself is correct).
- Slot strings must be `HH:00-HH:00` from `generateTimeSlots()`; the strict parser throws on anything else.
