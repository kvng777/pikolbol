# Booking & Payment
Customer books court slots, pays by GCash, admin verifies; plus cancellations/refunds, reschedule requests and admin manual bookings.

## Key files
- `src/app/page.tsx` — booking page orchestration (`bookingState`: idle → payment → confirmed modal)
- `src/components/home/BookSection.tsx` — wraps `BookingForm`; requires sign-in (`AuthModal`)
- `src/components/booking/BookingForm.tsx` — date/slot/equipment picker, estimated total
- `src/components/booking/PaymentScreen.tsx` — GCash QR + signed quote + "I've Completed Payment"
- `src/actions/payment.ts` — `submitPaymentAction`, `confirmPaymentAction`, `rejectPaymentAction`, pending list, status poll
- `src/lib/paymentService.ts` — insert pending rows, confirm/reject, status queries
- `src/lib/bookingService.ts` — availability queries, manual bookings, cancel/refund, reschedule requests, slots/closures
- `src/lib/bookingIdGenerator.ts` — 4-char `short_id` + `booking_group_id`
- `src/lib/emailService.ts` — all Resend emails (admin address is the hardcoded `ADMIN_EMAIL`)
- `src/app/api/admin/confirm-payment/route.ts` — one-click confirm link from the admin alert email (HMAC)
- `src/components/admin/PendingPayments.tsx`, `PendingRefunds.tsx`, `AdminBookingForm.tsx` — admin side
- `src/components/profile/BookingHistory.tsx`, `RescheduleModal.tsx` — customer side

## How it works
1. Signed-in customer picks date + consecutive slots + equipment (`BookingForm`); total shown is an estimate.
2. `PaymentScreen` fetches a signed quote (`getPriceQuoteAction`, see [pricing.md](pricing.md)) and shows that amount + GCash QR.
3. Customer pays in GCash, enters the reference, submits → `submitPaymentAction(token|null, payload, quote)`: validates details, court must be 1, `findBlockedSlots` (rules, one-day blocks, closed dates; fails closed), verifies quote, derives `user_id` from the token (guest if none), inserts one row per slot with status `pending`, the quoted `payment_amount` and `pricing_snapshot`. Sends the admin alert email with an HMAC confirm link.
4. Screen polls `getPaymentStatusAction` (id + status only). Admin confirms (Pending tab or email link; cards pending over 60 minutes show an amber "Waiting 2h" / "Waiting 1d+" badge from `lib/pendingAge.ts`, display only) → `confirmed` + confirmation email; or rejects → `rejected` + rejection email (slots released).
5. Cancel (customer, profile page): only `confirmed` groups; fee from the booking's snapshot (free if more than the window hours away, else fee per slot, capped at amount paid). Sets `cancelled`, `cancellation_fee`, `refund_amount`, `refund_status='pending'` if refund > 0, cancels any pending reschedule request, emails admin. Admin marks refund done (`markRefundCompletedAction`) → user email.
6. Reschedule: customer requests new date/slots (same slot count, confirmed, not past, no other pending request; checks booked, held slots and `findBlockedSlots`; approval re-checks blocks) → `reschedule_requests` row + admin email with HMAC approve/reject links. Approve = replace group (delete old rows, insert new ones keeping amount + snapshot); emails customer either way. Pending requests "hold" their target slots (`getHeldRescheduleSlotsByDate`).
7. Manual booking (admin): `createAdminBooking` inserts a confirmed, `is_manual` group (court 1, 2 players, no email), priced from the schedule. Blocks are enforced unless the admin confirms `overrideBlocks` (never closed dates; unchanged date + slots skip the check). Edit keeps the stored price unless date/slots/equipment change (`isSamePricedSelection`).

## Data
- `bookings`: one row per slot; `booking_group_id` + `short_id` shared by a group; `payment_status` `pending | confirmed | rejected | cancelled`; `payment_amount` = group total (stored on every row); `pricing_snapshot`; `gcash_reference`; `paddles_count`, `needs_balls`, `training_balls`; `cancellation_fee`, `refund_amount`, `refund_status`; `is_manual`; `rescheduled_from_*`.
- Partial unique index `bookings_active_slot_unique` on (date, time_slot, court_number) for active rows (`sql/slot-unique-constraint-fix-migration.sql`).
- `reschedule_requests` (status `pending | approved | rejected`), `payment_settings` (GCash QR/name/number, `payment_timeout_minutes`).
- Query keys: `['activeBookings', date]`, `['paymentStatus', ids]`, `['pendingPayments']`, `['userBookings', userId]`, `['pendingRefunds']`, `['pendingRescheduleRequests']` (+ `'mine'`), `['heldRescheduleSlots', date]`, `['allBookings']`.

## Rules (don't break)
- Only `pending` + `confirmed` block a slot; `rejected`/`cancelled` release it.
- Saved amount = signed quoted amount; never re-priced on the server for customers.
- Group-level money (`payment_amount`, fees, refunds) is per group, so count each group once (`booking_group_id || id`).
- Server derives the user from the token; customer actions never accept a user id.

## Gotchas / known gaps
- `payment_timeout_minutes` is stored and editable but nothing expires pending bookings automatically (`calculatePaymentDeadline` / `isPaymentExpired` are unused).
- Replace-group (manual edit, reschedule approve) is delete-then-insert, not one transaction: an insert failure loses the group.
- `submitPaymentAction` does not check past/too-soon slots (blocks are checked server-side; see [slots-and-closures.md](slots-and-closures.md)).
- Rows with no `booking_group_id` are legacy single bookings ("legacy-<id>").
