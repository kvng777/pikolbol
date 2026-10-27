# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Build production bundle
npm start        # Start production server
npm run lint     # Run ESLint
npm test         # Run unit tests (vitest, src/lib/agent)
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
- `['agentHistory', threadId]` — admin assistant chat history (gcTime 0)
- `['agentUsage']` — admin assistant monthly AI budget meter

### Booking System

**State machine:** idle → payment → pending → confirmed

**Payment statuses:** `pending | confirmed | rejected | cancelled`

**Slots:** 1-hour slots, 5:00 AM–12:00 AM (19 slots/day), single court (`court_number = 1`)

**Bulk bookings:** Multiple consecutive slots share a `booking_group_id`; each slot is a separate row.

**Slot availability:** Only `pending` and `confirmed` bookings block slots. Rejected/cancelled release slots. Admins can also disable specific slots or close date ranges.

**Payment holding:** Pending payments hold slots for a configurable timeout (default 15 min). Admin confirms payment after user claims via GCash QR flow.

### Pricing (from `lib/paymentConfig.ts`)

- Daytime (6 AM–5:59 PM): 200 PHP/slot
- Off-peak (5–6 AM, 6–10 PM): 250 PHP/slot
- Late-night (10 PM–12 AM): 300 PHP/slot
- Extra players beyond 4: +50 PHP/player
- Equipment: paddles 50, ball set 25, training balls 100 PHP per booking (charged for play dates from 2026-06-01)

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

### Admin AI Assistant

- Floating drawer on `/admin` (`components/admin/agent/AgentDrawer.tsx`), read-only. Renders only after the admin check; chat code is lazy-loaded on first open.
- `POST /api/admin/agent`: streaming chat (Vercel AI SDK `streamText`, `claude-sonnet-5-5`). Client sends `{ id, text, regenerate? }`; the server builds the user message (server-generated id) and replays history from `agent_messages`. Retry (`regenerate`) reuses the stored question and replaces the failed answer (`planTurn` in `lib/agent/history.ts`).
- `GET /api/admin/agent/history?id=`: restore a thread.
- `GET /api/admin/agent/threads`: the signed-in admin's own previous chats (up to 50, newest `updated_at` first), titled from each thread's first user message (`listThreads` / `threadTitle` in `lib/agent/history.ts`). Threads with no saved messages are skipped. Shown in the drawer's "Previous chats" view (History button, `AgentThreadList.tsx`; query key `['agentThreads']`, fetched only while that view is open and invalidated after every answer). Admins never see each other's chats, and there is no delete.
- Auth: all agent routes need `Authorization: Bearer <supabase access_token>`; `lib/agent/auth.ts` verifies the token + `profiles.role = 'admin'` (401/403 otherwise).
- Persistence: replies are saved on stream end even if the tab closes (`consumeSseStream`). After Stop the server still saves the full answer, so the next turn's context may include text the admin didn't see (acceptable for read-only Q&A).
- Token budget: last 20 messages are replayed; tool outputs older than the last 2 assistant turns are replaced with a stub.
- Markdown images are blocked in rendered replies (prompt-injection exfiltration guard).
- Thread id is stored per admin in localStorage (`pikol-agent-thread-id:<userId>`).
- Tools (`lib/agent/tools.ts`): `listBookings`, `getRevenueSummary`, `getSlotAvailability`, `getActionQueue`. All read-only and reuse `financeUtils` so numbers match the Finance tab. Emails and phone numbers are never sent to the model.
- Tables: `agent_threads`, `agent_messages` (`sql/admin-agent-migration.sql`), RLS on with no policies (service role only).
- Env: `ANTHROPIC_API_KEY` (server only).
- Monthly budget meter: after each turn the chat route's `onEnd` converts `totalUsage` tokens to USD (Sonnet 5.5 prices live in `lib/agent/usage.ts`, update them if the model or pricing changes) and inserts a row into `agent_usage` (`sql/agent-usage-migration.sql`, service role only). `GET /api/admin/agent/usage` returns this Manila calendar month's spend across all admins vs. the budget; `AgentUsageBar` shows it in the drawer (query key `['agentUsage']`, refreshed after every answer; amber at 80%, red at 100%).
  - Env: `AGENT_MONTHLY_BUDGET_PHP` (unset/invalid = no limit, nothing blocked) and `AGENT_USD_TO_PHP` (default 58).
  - Once the month's total reaches the budget, `POST /api/admin/agent` returns 402 `{ error: 'budget_exceeded', resetsOn }` and the chat input is disabled until the 1st of next month (Manila time). With no budget set, the gate is skipped (no DB query); if usage can't be loaded, the chat route fails closed with 503 `{ error: 'budget_unavailable' }` (`checkBudgetGate` in `lib/agent/usage.ts`).
  - Self-metered limits: the check runs before a turn, so one in-flight turn can overshoot (~₱5–20); only this app's usage is counted, and a turn that crashes before `onEnd` isn't recorded. Keep the Anthropic Console spend limit as the hard backstop.
- To add a tool: add it to `agentTools`, add a `case 'tool-<name>'` + label in `AgentMessage.tsx`, and mention it in the prompt only if it needs usage rules.

### Image Storage

Supabase Storage bucket `payment-assets` (public) is used for GCash QR codes. The image domain `dprvaqtjyhfoquuvfuxv.supabase.co` is whitelisted in `next.config.js`.
