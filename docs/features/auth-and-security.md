# Auth & Security
Supabase email/password auth with `user | admin` roles; every server action that touches admin or per-user data verifies the caller on the server.

## Key files
- `src/components/AuthProvider.tsx` — session context; admin flag via `isCurrentUserAdminAction(access_token)` (only the latest check applies)
- `src/lib/supabase.ts` — browser client (anon key, session in localStorage)
- `src/lib/supabase-server.ts` — server client (service role key; bypasses RLS)
- `src/lib/actionAuth.ts` — `getUserIdFromToken`, `requireUser`, `requireAdmin`, `ActionAuthError`
- `src/lib/accessToken.ts` — client `getAccessToken()` for hooks
- `src/lib/agent/auth.ts` — `requireAdmin(req)` for API routes (Bearer token → 401/403)
- `src/lib/adminTokens.ts` — HMAC tokens for email links (`ADMIN_ACTION_SECRET`)
- `src/actions/actionGuards.test.ts` — lists every protected action (incl. admin slot-rule actions in `src/actions/slotRules.ts`)
- `src/lib/html.ts` — `escapeHtml` for the HTML pages returned by email-link routes
- `src/actions/profile.ts` — `getMyProfileAction`, `upsertMyProfileAction` (name/phone only)

## How it works
1. Browser signs in with Supabase; the session lives in localStorage (no cookies), so the server can't see it implicitly.
2. Protected server actions take `accessToken` as their first argument; hooks call `await getAccessToken()`.
3. Admin actions call `await requireAdmin(token)` as their first statement (before any DB call); it verifies the JWT with `supabase.auth.getUser` and checks `profiles.role = 'admin'`.
4. User-scoped actions call `requireUser(token)` and use that id; they never accept a user id argument. Services also check ownership (cancel/reschedule).
5. `submitPaymentAction` accepts `token | null`: valid token → booking linked to that user; otherwise a guest booking (logs a warning if a non-empty token was rejected).
6. API routes (`/api/admin/agent/*`) use `Authorization: Bearer <token>` + `lib/agent/auth.ts`.
7. Email links (`/api/admin/confirm-payment`, `/api/admin/reschedule`) carry a purpose-scoped HMAC instead of a session (see below). Their HTML responses pass user-derived text through `escapeHtml`.

### Email-link tokens
- `HMAC-SHA256(ADMIN_ACTION_SECRET, "<purpose>:<id>")`, purpose = `confirm-payment` (id = booking group id), `reschedule-approve` or `reschedule-reject` (id = request id). Approve and reject links carry different tokens; a token fails for any other purpose or id.
- `verifyAdminToken` checks length and hex first, compares with `timingSafeEqual`, and returns false if the secret is missing.
- Legacy window: emails sent before this change carry `HMAC(id)`. Accepted only with `allowLegacy`: confirm-payment while the group still has a pending row; reschedule only if the request's `created_at` is before `LEGACY_TOKEN_CUTOFF` in `adminTokens.ts`. Remove the cutoff and legacy path once old requests are resolved.

## Data
- `profiles`: `user_id`, `name`, `phone`, `role`.
- Tables written only by the server (RLS on, no policies): `agent_*`, `pricing_schedules`, and others via service role.
- Env: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ACTION_SECRET`, `PRICE_QUOTE_SECRET` (server only).

## Rules (don't break)
- Every new admin action: `requireAdmin(accessToken)` first + add it to `ADMIN_ACTIONS` in `actionGuards.test.ts`.
- Public actions return no personal data: `getActiveBookingsByDateAction` → `SlotOccupancy` (date, slot, court, group id); `getPaymentStatusAction` → id + status; pricing list blanks `created_by`.
- Profile upsert only writes `name` and `phone` (no role escalation).
- In production Next.js hides thrown action error messages; auth failures surface as generic errors (acceptable: only hit by expired sessions or direct calls).

## Gotchas / known gaps
- Email-link routes mutate on GET (the tokens are purpose-scoped, but a link click still performs the action).
- `ADMIN_ACTION_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are flagged "Needs Attention" in Vercel (consider the Secret type).
