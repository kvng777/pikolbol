# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Build production bundle
npm start        # Start production server
npm run lint     # Run ESLint
```

## Tech Stack

- **Framework:** Next.js (App Router) with TypeScript
- **Styling:** TailwindCSS 4 + Shadcn/ui (base-nova style) + Lucide icons
- **Database/Auth:** Supabase (PostgreSQL + Supabase Auth)
- **State/Data Fetching:** React Query (@tanstack/react-query) wrapping Server Actions
- **Forms:** React Hook Form + Zod validation
- **Email:** Resend API
- **Notifications:** Sonner toasts

## Architecture

### Directory Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── page.tsx         # Home/booking page (main user flow)
│   ├── admin/           # Admin dashboard
│   ├── auth/            # Auth routes (reset-password)
│   └── profile/         # User profile & booking history
├── components/
│   ├── ui/              # Shadcn base components
│   ├── home/            # Landing page sections
│   ├── booking/         # Booking flow (Form, Calendar, PaymentScreen)
│   ├── auth/            # Auth forms
│   └── admin/           # Admin-specific components
├── hooks/               # React Query hooks wrapping server actions
├── lib/                 # Services and utilities
├── actions/             # Next.js Server Actions (all DB mutations)
├── types/               # TypeScript interfaces
└── sql/                 # Supabase migration files
```

### Data Flow Pattern

All DB mutations go through **Server Actions** (`/actions`). Client components use **React Query hooks** (`/hooks`) that wrap these actions. Cache is invalidated on mutations.

Key query key patterns:
- `['bookings', date]` — all bookings on a date
- `['activeBookings', date]` — pending/confirmed only (drives slot availability)
- `['allBookings']` — admin view
- `['disabledSlots', date]`, `['closedDates']` — admin slot controls

### Booking System

**State machine:** idle → payment → pending → confirmed

**Payment statuses:** `pending | awaiting_confirmation | confirmed | rejected | expired | cancelled`

**Slots:** 1-hour slots, 6:00 AM–10:00 PM (18 slots/day), single court (`court_number = 1`)

**Bulk bookings:** Multiple consecutive slots share a `booking_group_id`; each slot is a separate row.

**Slot availability:** Only `pending` and `confirmed` bookings block slots. Rejected/cancelled release slots. Admins can also disable specific slots or close date ranges.

**Payment holding:** Pending payments hold slots for a configurable timeout (default 15 min). Admin confirms payment after user claims via GCash QR flow.

### Pricing (from `lib/paymentConfig.ts`)

- Daytime (7 AM–5:59 PM): 200 PHP/slot
- Evening (6 PM+): 250 PHP/slot
- Extra players beyond 4: +50 PHP/player

### Auth & Roles

- Supabase Auth (email/password)
- `profiles` table has `role: 'user' | 'admin'`
- `AuthProvider.tsx` wraps the app with session context
- Two Supabase clients: `lib/supabase.ts` (client-side, anon key) and `lib/supabase-server.ts` (server-side, service role key)

### Database Tables

- `auth.users` — Supabase managed
- `profiles` — user_id, name, phone, role
- `bookings` — core booking data with payment fields, short_id, booking_group_id
- `payment_settings` — GCash QR URL, name, number, timeout_minutes
- `disabled_slots` — admin-blocked individual slots
- `closed_dates` — admin-blocked date ranges with reason

Schema changes must be applied via Supabase dashboard or SQL editor using files in `/sql`.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main booking UI and flow orchestration |
| `src/lib/bookingService.ts` | Core booking query logic |
| `src/lib/paymentConfig.ts` | Pricing constants and calculations |
| `src/lib/timeSlotGenerator.ts` | Slot availability logic |
| `src/components/booking/PaymentScreen.tsx` | GCash payment flow UI |
| `src/app/admin/page.tsx` | Admin dashboard |
| `src/lib/emailService.ts` | Email templates via Resend |
| `src/components/AuthProvider.tsx` | Auth context and session management |

### Image Storage

Supabase Storage bucket `payment-assets` (public) is used for GCash QR codes. The image domain `dprvaqtjyhfoquuvfuxv.supabase.co` is whitelisted in `next.config.js`.
