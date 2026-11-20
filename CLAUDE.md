# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Feature docs

Read the page for the area you're touching before exploring code:

- `docs/features/booking-and-payment.md` — booking flow, GCash payment, cancellations/refunds, reschedules, manual bookings
- `docs/features/pricing.md` — versioned prices, signed quotes, snapshots, Pricing tab
- `docs/features/auth-and-security.md` — roles, token-first server actions, public data rules, HMAC email links
- `docs/features/slots-and-closures.md` — slot list, availability, slot rules, one-day blocks, closed dates
- `docs/features/finance.md` — Finance tab calculations and data sources
- `docs/features/admin-assistant.md` — "Ask Pikol" admin AI assistant

When you change a feature, update its docs/features page in the same PR. `docs/superpowers/` holds historical specs/plans — background only, may be stale.

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Build production bundle
npm start        # Start production server
npm run lint     # Run ESLint
npm test         # Run unit tests (vitest: src/lib, src/lib/agent, src/actions)
```

## Tech Stack

- **Framework:** Next.js (App Router) with TypeScript
- **Styling:** TailwindCSS 4 + Shadcn/ui (base-nova style) + Lucide icons
- **Database/Auth:** Supabase (PostgreSQL + Supabase Auth)
- **State/Data Fetching:** React Query (@tanstack/react-query) wrapping Server Actions
- **Forms:** React Hook Form + Zod validation
- **Email:** Resend API
- **Notifications:** Sonner toasts
- **AI Assistant:** Vercel AI SDK v7 (ai, @ai-sdk/anthropic, @ai-sdk/react) + Claude Sonnet 5.5

## Architecture

### Directory Structure

```
src/
├── app/                 # Next.js App Router pages (+ app/api/admin/* routes)
│   ├── page.tsx         # Home/booking page (main user flow)
│   ├── admin/           # Admin dashboard
│   ├── auth/            # Auth routes (reset-password)
│   └── profile/         # User profile & booking history
├── components/          # ui/ (Shadcn), home/, booking/, auth/, admin/, profile/
├── hooks/               # React Query hooks wrapping server actions
├── lib/                 # Services and utilities (lib/agent = assistant)
├── actions/             # Next.js Server Actions (all DB mutations)
└── types/               # TypeScript interfaces
sql/                     # Supabase migration files (repo root)
docs/features/           # Current-state feature docs
```

### Data Flow Pattern

All DB mutations go through **Server Actions** (`/actions`). Client components use **React Query hooks** (`/hooks`) that wrap these actions. Cache is invalidated on mutations. Each feature doc lists its query keys; common ones: `['activeBookings', date]` (drives availability), `['allBookings']` (admin + Finance), `['disabledSlots', date]`, `['closedDates']`, `['slotRules']` / `['slotRules','admin']`, `['pricing']`.

### Booking System (summary — see booking-and-payment.md)

- **State machine:** idle → payment → pending → confirmed. **Payment statuses:** `pending | confirmed | rejected | cancelled`.
- **Slots:** 1-hour slots, 5:00 AM–12:00 AM (19 slots/day), single court (`court_number = 1`).
- **Groups:** consecutive slots share `booking_group_id` + `short_id`; one row per slot; `payment_amount` is the group total.
- **Availability:** only `pending`/`confirmed` block slots; admins can also block single slots, add slot rules, or close date ranges. Every booking write path re-checks blocks on the server (`lib/slotAvailability.ts`).
- Customer pays exactly a server-signed price quote; admin confirms after the GCash claim.

### Pricing (summary — see pricing.md)

- Versioned rows in `pricing_schedules`, applied by play date (Manila); edited in the admin **Pricing** tab (apply now or schedule).
- All math in `lib/pricing.ts`; never hardcode a price. Bookings store `payment_amount` + `pricing_snapshot`.
- Requires `PRICE_QUOTE_SECRET`; fails closed ("Prices unavailable") if prices or the secret are missing.

### Auth & Roles (summary — see auth-and-security.md)

- Supabase Auth (email/password); `profiles.role: 'user' | 'admin'`; `AuthProvider.tsx` holds the session.
- Clients: `lib/supabase.ts` (browser, anon key) and `lib/supabase-server.ts` (server, service role key).
- Protected server actions take `accessToken` first: `requireAdmin` / `requireUser` from `lib/actionAuth.ts`. List every protected action in `src/actions/actionGuards.test.ts`. Public actions return no personal data.
- Email links (`/api/admin/confirm-payment`, `/api/admin/reschedule`) use HMAC tokens (`lib/adminTokens.ts`, `ADMIN_ACTION_SECRET`).

### Admin AI Assistant (summary — see admin-assistant.md)

- Read-only "Ask Pikol" drawer on `/admin`; `POST /api/admin/agent` streams `claude-sonnet-5-5` with read-only tools that reuse `financeUtils`.
- Bearer-token admin auth; chats persisted in `agent_threads` / `agent_messages`; monthly budget meter in `agent_usage`.
- Env: `ANTHROPIC_API_KEY`, `AGENT_MONTHLY_BUDGET_PHP`, `AGENT_USD_TO_PHP`.

### Database Tables

- `auth.users` — Supabase managed; `profiles` — user_id, name, phone, role
- `bookings` — core booking data with payment fields, short_id, booking_group_id, pricing_snapshot
- `payment_settings` — GCash QR URL, name, number, timeout_minutes
- `slot_rules` — reusable slot blocks (recurring, ranges, opening hours); see `docs/features/slots-and-closures.md`
- `disabled_slots` — admin-blocked individual slots; `closed_dates` — blocked date ranges with reason
- `reschedule_requests` — customer reschedule requests awaiting admin
- `pricing_schedules` — versioned prices by effective play date
- `site_notice` — homepage notice banner
- `agent_threads`, `agent_messages`, `agent_usage` — assistant (service role only)

Schema changes must be applied via Supabase dashboard or SQL editor using files in `/sql`.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main booking UI and flow orchestration |
| `src/app/admin/page.tsx` | Admin dashboard (tabs) |
| `src/lib/bookingService.ts` | Core booking queries, manual bookings, cancel/refund, reschedules |
| `src/actions/payment.ts` | Customer submit (quote verify) + admin confirm/reject |
| `src/lib/pricing.ts` | All price math from a version's `PricingRules` (pure) |
| `src/lib/timeSlotGenerator.ts` | Slot list and availability |
| `src/lib/actionAuth.ts` | Server-side caller checks |
| `src/lib/financeUtils.ts` | Finance calculations (shared with assistant) |
| `src/lib/emailService.ts` | Email templates via Resend |
| `src/components/booking/PaymentScreen.tsx` | GCash payment flow UI |
| `src/components/AuthProvider.tsx` | Auth context and session management |

### Image Storage

Supabase Storage bucket `payment-assets` (public) is used for GCash QR codes. The image domain `dprvaqtjyhfoquuvfuxv.supabase.co` is whitelisted in `next.config.js`.
