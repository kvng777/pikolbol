# Server-Side Auth for Server Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every server action that touches admin data or a specific user's data verifies the caller's Supabase session on the server, and public actions stop leaking customer personal data.

**Architecture:** The browser keeps the Supabase session in localStorage (no cookies), so server actions can't see who is calling. Each protected action takes the caller's `accessToken` as its first argument; a shared server helper (`lib/actionAuth.ts`) verifies it with `supabase.auth.getUser(token)` and, for admin actions, checks `profiles.role = 'admin'`. User-scoped actions derive the user id from the token instead of trusting a `userId` argument. Hooks fetch the token with a shared client helper (`lib/accessToken.ts`). This is the same pattern the admin assistant already uses (`lib/agent/auth.ts`), which is refactored to share the helper.

**Tech Stack:** Next.js App Router server actions, Supabase JS v2, React Query, Vitest.

**Why this is a prerequisite:** the Pricing tab (Plan 2) adds an action that changes what customers are charged. Without this plan, anyone can call it directly.

---

## Action inventory (decisions locked in)

| Action | Today | After |
|---|---|---|
| `getAllBookingsAction`, `deleteBookingAction`, `createAdminBookingAction`, `updateAdminBookingAction`, `addDisabledSlotAction`, `removeDisabledSlotAction`, `addClosedDateAction`, `removeClosedDateAction`, `getAllDisabledSlotsAction`, `getPendingRefundsAction`, `markRefundCompletedAction`, `approveRescheduleRequestAction`, `rejectRescheduleRequestAction`, `getPendingRescheduleRequestsAction` | open | **admin** |
| `confirmPaymentAction`, `rejectPaymentAction`, `getPendingPaymentsAction` | open | **admin** |
| `updatePaymentSettingsAction`, `uploadQRCodeAction`, `getNoticeAction`, `updateNoticeAction` | open | **admin** |
| `getBookingsByUserIdAction(userId)` | trusts userId | **replaced** by `getMyBookingsAction(token)` |
| `cancelBookingGroupAction(..., userId)`, `createRescheduleRequestAction(..., userId, ...)` | trusts userId | user id from token |
| `getProfileAction`, `upsertProfileAction`, `isUserAdminAction` (all take userId) | trusts userId | `getMyProfileAction`, `upsertMyProfileAction`, `isCurrentUserAdminAction` (token) |
| Profile page reads **all** pending reschedule requests (other customers' names/emails/phones) | leak | new `getMyPendingRescheduleRequestsAction(token)` |
| `getActiveBookingsByDateAction` (public booking page) returns full rows incl. name/email/phone | leak | returns only `date, time_slot, court_number, booking_group_id` |
| `getPaymentStatusAction` returns full rows | leak | returns only `id, payment_status` |
| `submitPaymentAction` takes `user_id` from browser | trusts it | optional token → user id derived server-side (guests still allowed) |
| `createBookingAction`, `createBookingsAction`, `getPaymentInfoAction`, `getBookingsByDateAction`, `getConfirmedBookingsAction`, `cancelBookingAction`, `updateProfileAction` | no callers (some create bookings without payment) | **deleted**, with their unused hooks |
| `getActiveNoticeAction`, `getPaymentSettingsAction`, `getDisabledSlotsByDateAction`, `getClosedDatesAction`, `getHeldRescheduleSlotsByDateAction` | public, no personal data | unchanged |

Out of scope: `/api/admin/confirm-payment` (already HMAC-protected), `/api/admin/agent/*` (already guarded).

## File map

- Create `src/lib/actionAuth.ts` — server: verify token → user id; require admin. Throws `ActionAuthError`.
- Create `src/lib/actionAuth.test.ts`
- Create `src/lib/accessToken.ts` — client: current session's access token.
- Create `src/actions/actionGuards.test.ts` — every protected action rejects missing/non-admin tokens.
- Modify `src/lib/agent/auth.ts` — reuse `actionAuth`.
- Modify `src/hooks/useAgentThread.ts` — re-export `getAccessToken` from `lib/accessToken`.
- Modify `vitest.config.ts` — include the new tests.
- Modify `src/actions/bookings.ts`, `payment.ts`, `paymentSettings.ts`, `notice.ts`, `profile.ts`.
- Modify `src/lib/bookingService.ts` (2 new queries), `src/lib/paymentService.ts` (1 new query), `src/types/booking.ts`, `src/types/payment.ts`, `src/lib/timeSlotGenerator.ts`.
- Modify hooks: `useBookings.ts`, `useRefunds.ts`, `usePayment.ts`, `usePaymentSettings.ts`, `useNotice.ts`, `useProfile.ts`, `useAdminPage.ts`.
- Modify components: `AuthProvider.tsx`, `app/profile/page.tsx`, `booking/PaymentScreen.tsx`.

---

### Task 1: Server auth helper

**Files:**
- Create: `src/lib/actionAuth.ts`
- Create: `src/lib/actionAuth.test.ts`
- Modify: `src/lib/agent/auth.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Widen the vitest include**

In `vitest.config.ts`, replace the `include` line:

```ts
    include: ['src/lib/agent/**/*.test.ts', 'src/lib/*.test.ts', 'src/actions/**/*.test.ts'],
```

(`src/lib/__tests__/bookingService.test.ts` stays excluded: it is a tsx script, not a vitest suite.)

- [ ] **Step 2: Write the failing test**

`src/lib/actionAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, getProfileByUserId } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ supabase: { auth: { getUser } } }))
vi.mock('@/lib/profileService', () => ({ getProfileByUserId }))

import { getUserIdFromToken, requireUser, requireAdmin, ActionAuthError } from './actionAuth'

describe('actionAuth', () => {
  beforeEach(() => {
    getUser.mockReset()
    getProfileByUserId.mockReset()
  })

  it('getUserIdFromToken returns null for an empty token without calling Supabase', async () => {
    expect(await getUserIdFromToken('')).toBeNull()
    expect(await getUserIdFromToken(null)).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('getUserIdFromToken returns null when Supabase rejects the token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') })
    expect(await getUserIdFromToken('nope')).toBeNull()
  })

  it('requireUser returns the user id for a valid token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await requireUser('ok')).toBe('u1')
    expect(getUser).toHaveBeenCalledWith('ok')
  })

  it('requireUser throws unauthorized without a token', async () => {
    await expect(requireUser('')).rejects.toBeInstanceOf(ActionAuthError)
    await expect(requireUser('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('requireAdmin throws forbidden for a non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    await expect(requireAdmin('ok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('requireAdmin throws forbidden when the profile is missing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue(null)
    await expect(requireAdmin('ok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('requireAdmin returns the admin user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    expect(await requireAdmin('ok')).toBe('admin-1')
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/lib/actionAuth.test.ts`
Expected: FAIL — cannot resolve `./actionAuth`.

- [ ] **Step 4: Implement**

`src/lib/actionAuth.ts`:

```ts
import { supabase } from './supabase-server'
import { getProfileByUserId } from './profileService'

/**
 * Server-side caller checks for server actions.
 * The browser keeps the Supabase session in localStorage (not cookies), so
 * protected actions take the caller's access token as their first argument.
 */
export class ActionAuthError extends Error {
  constructor(public code: 'unauthorized' | 'forbidden') {
    super(code === 'unauthorized' ? 'Please sign in again.' : 'You do not have access to this action.')
    this.name = 'ActionAuthError'
  }
}

/** Verified user id for the token, or null (no token / invalid / expired). */
export async function getUserIdFromToken(accessToken: string | null | undefined): Promise<string | null> {
  const token = accessToken?.trim()
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export async function requireUser(accessToken: string | null | undefined): Promise<string> {
  const userId = await getUserIdFromToken(accessToken)
  if (!userId) throw new ActionAuthError('unauthorized')
  return userId
}

export async function requireAdmin(accessToken: string | null | undefined): Promise<string> {
  const userId = await requireUser(accessToken)
  const profile = await getProfileByUserId(userId)
  if (profile?.role !== 'admin') throw new ActionAuthError('forbidden')
  return userId
}
```

- [ ] **Step 5: Make the agent's guard reuse it**

Replace the body of `src/lib/agent/auth.ts` with:

```ts
import { requireAdmin as requireAdminToken, ActionAuthError } from '@/lib/actionAuth'

/**
 * Verify the caller is a signed-in admin.
 * The browser keeps the Supabase session in localStorage (not cookies),
 * so the client must send `Authorization: Bearer <access_token>`.
 * Returns `{ userId }` on success, or a Response to return as-is.
 */
export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1].trim() ?? ''

  try {
    return { userId: await requireAdminToken(token) }
  } catch (err) {
    if (err instanceof ActionAuthError) {
      return err.code === 'forbidden'
        ? new Response('Forbidden', { status: 403 })
        : new Response('Unauthorized', { status: 401 })
    }
    throw err
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, including the existing `src/lib/agent/auth.test.ts` (it mocks the same two modules, so its behaviour is unchanged).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/actionAuth.ts src/lib/actionAuth.test.ts src/lib/agent/auth.ts
git commit -m "feat(auth): add server-side token check for server actions"
```

---

### Task 2: Client access-token helper

**Files:**
- Create: `src/lib/accessToken.ts`
- Modify: `src/hooks/useAgentThread.ts:17-20`

- [ ] **Step 1: Create the helper**

`src/lib/accessToken.ts`:

```ts
'use client'

import { supabase } from './supabase'

/** Current session's access token ('' when signed out). Pass it to protected server actions. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}
```

- [ ] **Step 2: Re-export from `useAgentThread.ts`**

Delete the local `getAccessToken` function (lines 17–20) and add below the imports:

```ts
export { getAccessToken } from '@/lib/accessToken'
```

Remove the now-unused `import { supabase } from '@/lib/supabase'` only if nothing else in the file uses `supabase` (check with `grep -n "supabase\." src/hooks/useAgentThread.ts`).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/accessToken.ts src/hooks/useAgentThread.ts
git commit -m "refactor(auth): share client access-token helper"
```

---

### Task 3: Guard booking admin actions, remove dead actions

**Files:**
- Create: `src/actions/actionGuards.test.ts`
- Modify: `src/actions/bookings.ts`
- Modify: `src/hooks/useBookings.ts`, `src/hooks/useRefunds.ts`, `src/hooks/useAdminPage.ts`

- [ ] **Step 1: Write the failing guard test**

`src/actions/actionGuards.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, getProfileByUserId } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ supabase: { auth: { getUser } } }))
vi.mock('@/lib/profileService', () => ({
  getProfileByUserId,
  updateProfile: vi.fn(),
  upsertProfile: vi.fn(),
}))
// Automocked: every export becomes a vi.fn() returning undefined.
vi.mock('@/lib/bookingService')
vi.mock('@/lib/paymentService')
vi.mock('@/lib/paymentSettingsService')
vi.mock('@/lib/noticeService')
vi.mock('@/lib/emailService')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import * as bookings from './bookings'
import * as bookingService from '@/lib/bookingService'

type Call = [name: string, call: (token: string) => Promise<unknown>]

const payload = { name: 'X', date: '2026-12-01', timeSlots: ['08:00 - 09:00'] }

const ADMIN_ACTIONS: Call[] = [
  ['getAllBookingsAction', (t) => bookings.getAllBookingsAction(t)],
  ['deleteBookingAction', (t) => bookings.deleteBookingAction(t, 'id')],
  ['createAdminBookingAction', (t) => bookings.createAdminBookingAction(t, payload)],
  ['updateAdminBookingAction', (t) => bookings.updateAdminBookingAction(t, 'g1', payload)],
  ['addDisabledSlotAction', (t) => bookings.addDisabledSlotAction(t, '2026-12-01', '08:00 - 09:00')],
  ['removeDisabledSlotAction', (t) => bookings.removeDisabledSlotAction(t, 'id')],
  ['addClosedDateAction', (t) => bookings.addClosedDateAction(t, '2026-12-01', '2026-12-02', 'r')],
  ['removeClosedDateAction', (t) => bookings.removeClosedDateAction(t, 'id')],
  ['getPendingRefundsAction', (t) => bookings.getPendingRefundsAction(t)],
  ['markRefundCompletedAction', (t) => bookings.markRefundCompletedAction(t, 'g1', null)],
  ['approveRescheduleRequestAction', (t) => bookings.approveRescheduleRequestAction(t, 'r1')],
  ['rejectRescheduleRequestAction', (t) => bookings.rejectRescheduleRequestAction(t, 'r1')],
  ['getPendingRescheduleRequestsAction', (t) => bookings.getPendingRescheduleRequestsAction(t)],
]

describe('admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(ADMIN_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it.each(ADMIN_ACTIONS)('%s rejects a signed-in non-admin', async (_name, call) => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    await expect(call('tok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('does not touch the database when the guard fails', async () => {
    await expect(bookings.deleteBookingAction('', 'id')).rejects.toThrow()
    expect(bookingService.deleteBooking).not.toHaveBeenCalled()
  })

  it('runs the action for an admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    vi.mocked(bookingService.deleteBooking).mockResolvedValue({ success: true })
    await expect(bookings.deleteBookingAction('tok', 'id')).resolves.toEqual({ success: true })
    expect(bookingService.deleteBooking).toHaveBeenCalledWith('id')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/actions/actionGuards.test.ts`
Expected: FAIL — admin actions resolve instead of rejecting (and type errors on the extra `token` argument are fine at this stage; vitest does not type-check).

- [ ] **Step 3: Rewrite `src/actions/bookings.ts`**

Replace the whole file with the version below. Changes: admin actions take `accessToken` first and call `requireAdmin` **before anything else** (including `isDateClosed`); customer actions are handled in Task 6, so they are left as-is here except the dead ones, which are deleted (`createBookingAction`, `createBookingsAction`, `getBookingsByDateAction`, `getConfirmedBookingsAction`, `cancelBookingAction`, `getAllDisabledSlotsAction`).

```ts
'use server'

import {
  getActiveBookingsByDate,
  getAllBookings,
  deleteBooking,
  getDisabledSlotsByDate,
  addDisabledSlot,
  removeDisabledSlot,
  getClosedDates,
  addClosedDate,
  removeClosedDate,
  isDateClosed,
  getBookingsByUserId,
  cancelBookingGroup,
  getPendingRefunds,
  markRefundCompleted,
  createAdminBooking,
  updateAdminBooking,
  createRescheduleRequest,
  approveRescheduleRequest,
  rejectRescheduleRequest,
  getPendingRescheduleRequests,
  getHeldRescheduleSlotsByDate,
} from '@/lib/bookingService'
import {
  Booking,
  DisabledSlot,
  ClosedDate,
  CancelBookingResult,
  RescheduleBookingResult,
  RescheduleRequest,
  AdminBookingPayload,
} from '@/types/booking'
import { requireAdmin } from '@/lib/actionAuth'
import { revalidatePath } from 'next/cache'

/**
 * Create a manual booking on behalf of a player (admin only).
 * Confirmed immediately, flagged manual, no emails. Blocks closed dates.
 */
export async function createAdminBookingAction(
  accessToken: string,
  payload: AdminBookingPayload
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  await requireAdmin(accessToken)

  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date. Please select another date.' }
  }

  const result = await createAdminBooking(payload)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

/**
 * Update an existing manual booking group (admin only). Editable anytime.
 */
export async function updateAdminBookingAction(
  accessToken: string,
  bookingGroupId: string,
  payload: AdminBookingPayload
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  await requireAdmin(accessToken)

  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date. Please select another date.' }
  }

  const result = await updateAdminBooking(bookingGroupId, payload)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

/**
 * Get ACTIVE bookings by date - only bookings that occupy slots
 * (pending payment, awaiting confirmation, or confirmed)
 * Use this for slot availability checking
 */
export async function getActiveBookingsByDateAction(date: string): Promise<Booking[]> {
  return getActiveBookingsByDate(date)
}

/**
 * Get ALL bookings - for admin view
 */
export async function getAllBookingsAction(accessToken: string): Promise<Booking[]> {
  await requireAdmin(accessToken)
  return getAllBookings()
}

export async function deleteBookingAction(accessToken: string, id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await deleteBooking(id)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

export async function getDisabledSlotsByDateAction(date: string): Promise<DisabledSlot[]> {
  return getDisabledSlotsByDate(date)
}

export async function addDisabledSlotAction(accessToken: string, date: string, timeSlot: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await addDisabledSlot(date, timeSlot)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function removeDisabledSlotAction(accessToken: string, id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await removeDisabledSlot(id)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function getClosedDatesAction(): Promise<ClosedDate[]> {
  return getClosedDates()
}

export async function addClosedDateAction(accessToken: string, startDate: string, endDate: string, reason: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await addClosedDate(startDate, endDate, reason)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function removeClosedDateAction(accessToken: string, id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await removeClosedDate(id)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

/**
 * Get all bookings for a specific user
 */
export async function getBookingsByUserIdAction(userId: string): Promise<Booking[]> {
  return getBookingsByUserId(userId)
}

/**
 * Cancel a booking group (all slots in the same order)
 * Calculates cancellation fee based on timing:
 * - Free cancellation: > 24 hours before booking
 * - P100/slot fee: <= 24 hours before booking
 */
export async function cancelBookingGroupAction(
  bookingGroupId: string | null,
  legacyBookingId: string | null,
  userId: string
): Promise<CancelBookingResult> {
  const result = await cancelBookingGroup(bookingGroupId, legacyBookingId, userId)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * Get all bookings with pending refunds (admin only)
 */
export async function getPendingRefundsAction(accessToken: string): Promise<Booking[]> {
  await requireAdmin(accessToken)
  return getPendingRefunds()
}

/**
 * Mark a refund as completed (admin action after processing via GCash)
 */
export async function markRefundCompletedAction(
  accessToken: string,
  bookingGroupId: string | null,
  legacyBookingId: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await markRefundCompleted(bookingGroupId, legacyBookingId)

  if (result.success) {
    revalidatePath('/admin')
  }

  return result
}

/**
 * Create a reschedule request (user action).
 * Does NOT move the booking — admin must approve or reject.
 */
export async function createRescheduleRequestAction(
  bookingGroupId: string | null,
  legacyBookingId: string | null,
  userId: string,
  newDate: string,
  newTimeSlots: string[]
): Promise<RescheduleBookingResult> {
  const isClosed = await isDateClosed(newDate)
  if (isClosed) {
    return { success: false, error: 'The court is closed on that date. Please select another date.' }
  }

  const result = await createRescheduleRequest(bookingGroupId, legacyBookingId, userId, newDate, newTimeSlots)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * Approve a pending reschedule request (admin action).
 */
export async function approveRescheduleRequestAction(
  accessToken: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await approveRescheduleRequest(requestId)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * Reject a pending reschedule request (admin action).
 */
export async function rejectRescheduleRequestAction(
  accessToken: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin(accessToken)
  const result = await rejectRescheduleRequest(requestId)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * Get pending reschedule requests (for admin view).
 */
export async function getPendingRescheduleRequestsAction(accessToken: string): Promise<RescheduleRequest[]> {
  await requireAdmin(accessToken)
  return getPendingRescheduleRequests()
}

/**
 * Get time slots held by pending reschedule requests for a given date.
 */
export async function getHeldRescheduleSlotsByDateAction(date: string): Promise<string[]> {
  return getHeldRescheduleSlotsByDate(date)
}
```

- [ ] **Step 4: Update `src/hooks/useBookings.ts`**

1. Add `import { getAccessToken } from '@/lib/accessToken'` below the existing imports.
2. Remove the imports and hooks for deleted actions: `getBookingsByDateAction` / `useBookingsByDate`, `getConfirmedBookingsAction` / `useConfirmedBookings`, `getAllDisabledSlotsAction` / `useAllDisabledSlots`, `cancelBookingAction` / `useCancelBooking`. (None have callers outside `src/hooks`.)
3. Pass the token in every admin hook:

```ts
// useAllBookings
    queryFn: async () => getAllBookingsAction(await getAccessToken()),

// useAddDisabledSlot
    mutationFn: async ({ date, timeSlot }: { date: string; timeSlot: string }) =>
      addDisabledSlotAction(await getAccessToken(), date, timeSlot),

// useRemoveDisabledSlot
    mutationFn: async (id: string) => removeDisabledSlotAction(await getAccessToken(), id),

// useAddClosedDate
    mutationFn: async ({ startDate, endDate, reason }: { startDate: string; endDate: string; reason: string }) =>
      addClosedDateAction(await getAccessToken(), startDate, endDate, reason),

// useRemoveClosedDate
    mutationFn: async (id: string) => removeClosedDateAction(await getAccessToken(), id),

// useDeleteBooking
    mutationFn: async (id: string) => deleteBookingAction(await getAccessToken(), id),

// useCreateAdminBooking
    mutationFn: async (payload: AdminBookingPayload) => createAdminBookingAction(await getAccessToken(), payload),

// useUpdateAdminBooking
    mutationFn: async ({ bookingGroupId, payload }: { bookingGroupId: string; payload: AdminBookingPayload }) =>
      updateAdminBookingAction(await getAccessToken(), bookingGroupId, payload),

// useApproveRescheduleRequest
    mutationFn: async (requestId: string) => approveRescheduleRequestAction(await getAccessToken(), requestId),

// useRejectRescheduleRequest
    mutationFn: async (requestId: string) => rejectRescheduleRequestAction(await getAccessToken(), requestId),

// usePendingRescheduleRequests
    queryFn: async () => getPendingRescheduleRequestsAction(await getAccessToken()),
```

- [ ] **Step 5: Update `src/hooks/useRefunds.ts`**

Add `import { getAccessToken } from '@/lib/accessToken'`, then:

```ts
// usePendingRefunds
    queryFn: async () => getPendingRefundsAction(await getAccessToken()),

// useMarkRefundCompleted
    mutationFn: async ({
      bookingGroupId,
      legacyBookingId
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
    }) => markRefundCompletedAction(await getAccessToken(), bookingGroupId, legacyBookingId),
```

- [ ] **Step 6: Update `src/hooks/useAdminPage.ts`**

Add `import { getAccessToken } from '@/lib/accessToken'` and change both delete calls (lines ~171 and ~190):

```ts
    const result = await deleteBookingAction(await getAccessToken(), id)
```

```ts
      const result = await deleteBookingAction(await getAccessToken(), id)
```

- [ ] **Step 7: Run the guard test and type-check**

Run: `npx vitest run src/actions/actionGuards.test.ts && npx tsc --noEmit`
Expected: test PASS. `tsc` may still report errors only in files touched by Tasks 4–6 (`usePendingRescheduleRequests` caller on the profile page is fixed in Task 6). Any other error must be fixed now.

- [ ] **Step 8: Commit**

```bash
git add src/actions/bookings.ts src/actions/actionGuards.test.ts src/hooks/useBookings.ts src/hooks/useRefunds.ts src/hooks/useAdminPage.ts
git commit -m "fix(security): require admin session for booking admin actions"
```

---

### Task 4: Guard payment actions; derive the booking's user server-side

**Files:**
- Modify: `src/actions/payment.ts`
- Modify: `src/lib/paymentService.ts`
- Modify: `src/types/payment.ts`
- Modify: `src/hooks/usePayment.ts`
- Modify: `src/components/booking/PaymentScreen.tsx:67-80`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Add failing cases to the guard test**

In `src/actions/actionGuards.test.ts` add the import and extend `ADMIN_ACTIONS`:

```ts
import * as payment from './payment'
import * as paymentService from '@/lib/paymentService'
```

```ts
  ['confirmPaymentAction', (t) => payment.confirmPaymentAction(t, ['b1'])],
  ['rejectPaymentAction', (t) => payment.rejectPaymentAction(t, ['b1'], 'r')],
  ['getPendingPaymentsAction', (t) => payment.getPendingPaymentsAction(t)],
```

and add a new `describe` block at the end of the file:

```ts
describe('submitPaymentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
    vi.mocked(paymentService.createBookingWithPendingPayment).mockResolvedValue({ success: false, error: 'x' })
  })

  const body = {
    name: 'X', phone: '0917', email: 'x@y.z', date: '2026-12-01',
    timeSlots: ['08:00 - 09:00'], courtNumber: 1, players: 4,
  }

  it('saves the user id from the verified token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    await payment.submitPaymentAction('tok', body)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' })
    )
  })

  it('books as a guest when there is no token', async () => {
    await payment.submitPaymentAction(null, body)
    expect(paymentService.createBookingWithPendingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: undefined })
    )
  })
})

describe('getPaymentStatusAction', () => {
  it('returns only id and status', async () => {
    vi.mocked(paymentService.getPaymentStatusSummary).mockResolvedValue([{ id: 'b1', payment_status: 'pending' }])
    await expect(payment.getPaymentStatusAction(['b1'])).resolves.toEqual([{ id: 'b1', payment_status: 'pending' }])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/actions/actionGuards.test.ts`
Expected: FAIL on the three payment admin actions, `submitPaymentAction`, and `getPaymentStatusSummary` (not defined).

- [ ] **Step 3: Add the slim status query**

In `src/types/payment.ts` add:

```ts
/** What the payment screen polls for: no personal data. */
export interface PaymentStatusSummary {
  id: string
  payment_status: PaymentStatus
}
```

In `src/lib/paymentService.ts`, add `PaymentStatusSummary` to the `@/types/payment` import and add below `getPaymentStatus`:

```ts
/**
 * Status-only lookup for the public payment screen (no personal data).
 */
export async function getPaymentStatusSummary(bookingIds: string[]): Promise<PaymentStatusSummary[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, payment_status')
    .in('id', bookingIds)

  if (error) {
    console.error('Error fetching payment status:', error)
    return []
  }

  return (data || []) as PaymentStatusSummary[]
}
```

- [ ] **Step 4: Update `src/actions/payment.ts`**

1. Imports: add `getPaymentStatusSummary` to the `@/lib/paymentService` import; remove `getBookingWithPayment` and `getPaymentSettings` imports and `PaymentInfo` from the types import (used only by the deleted `getPaymentInfoAction`); add `PaymentStatusSummary` to the types import; add `import { requireAdmin, getUserIdFromToken } from '@/lib/actionAuth'`.
2. `submitPaymentAction`: new signature and user id derivation. Replace the signature and the `createBookingWithPendingPayment` call:

```ts
export async function submitPaymentAction(
  accessToken: string | null,
  payload: {
    name: string
    phone: string
    email: string
    date: string
    timeSlots: string[]
    courtNumber: number
    players: number
    paddles?: number
    needsBalls?: boolean
    trainingBalls?: boolean
    gcashReference?: string
  }
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  // Check if date is closed
  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date.' }
  }

  // Link the booking to the signed-in user (verified), or book as a guest
  const userId = (await getUserIdFromToken(accessToken)) ?? undefined

  const result = await createBookingWithPendingPayment({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    timeSlots: payload.timeSlots,
    court_number: payload.courtNumber,
    players: payload.players,
    paddles: payload.paddles,
    needs_balls: payload.needsBalls,
    training_balls: payload.trainingBalls,
    user_id: userId,
    gcash_reference: payload.gcashReference,
  })
```

(The rest of the function body is unchanged.)

3. Admin actions: add the token parameter and guard as the first line:

```ts
export async function confirmPaymentAction(accessToken: string, bookingIds: string[]): Promise<PaymentResult> {
  await requireAdmin(accessToken)
  // Get booking info before confirming (for email)
```

```ts
export async function rejectPaymentAction(accessToken: string, bookingIds: string[], reason?: string): Promise<PaymentResult> {
  await requireAdmin(accessToken)
  // Get booking info before rejecting (for email)
```

```ts
export async function getPendingPaymentsAction(accessToken: string): Promise<PendingPaymentBooking[]> {
  await requireAdmin(accessToken)
  return getPendingPayments()
}
```

4. Replace `getPaymentStatusAction`:

```ts
/**
 * Get payment status for specific bookings (public: status only, no personal data)
 */
export async function getPaymentStatusAction(bookingIds: string[]): Promise<PaymentStatusSummary[]> {
  return getPaymentStatusSummary(bookingIds)
}
```

5. Delete `getPaymentInfoAction` (no callers).

- [ ] **Step 5: Update `src/hooks/usePayment.ts`**

Add `import { getAccessToken } from '@/lib/accessToken'`; change `Booking` import to `PaymentStatusSummary` from `@/types/payment` where used:

```ts
// useSubmitPayment
    mutationFn: async (payload: Parameters<typeof submitPaymentAction>[1]) =>
      submitPaymentAction((await getAccessToken()) || null, payload),

// usePaymentStatus
  return useQuery<PaymentStatusSummary[]>({

// usePendingPayments
    queryFn: async () => getPendingPaymentsAction(await getAccessToken()),

// useConfirmPayment
    mutationFn: async (bookingIds: string[]) => confirmPaymentAction(await getAccessToken(), bookingIds),

// useRejectPayment
    mutationFn: async ({ bookingIds, reason }: { bookingIds: string[]; reason?: string }) =>
      rejectPaymentAction(await getAccessToken(), bookingIds, reason),
```

Remove the `Booking` import if it is now unused.

- [ ] **Step 6: Update `PaymentScreen.tsx`**

In the `submitPayment.mutateAsync({ ... })` call (~line 67), delete the `user_id: bookingData.user_id,` line. Leave the `user_id` field on the `bookingData` prop type alone (callers still pass it; it is now ignored, which is harmless). Line 56 (`currentBookings?.[0]?.payment_status`) keeps working with `PaymentStatusSummary[]`.

- [ ] **Step 7: Find other callers of the changed payment hooks**

Run: `grep -rn "useConfirmPayment\|useRejectPayment\|confirmPayment.mutate\|rejectPayment.mutate" src --include="*.tsx"`
For each `confirmPayment.mutate(...)`/`mutateAsync(...)` call, confirm it passes a `string[]` (unchanged contract). No edits expected.

- [ ] **Step 8: Run tests and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: tests PASS. Remaining `tsc` errors only in files fixed in Tasks 5–6.

- [ ] **Step 9: Commit**

```bash
git add src/actions/payment.ts src/lib/paymentService.ts src/types/payment.ts src/hooks/usePayment.ts src/components/booking/PaymentScreen.tsx src/actions/actionGuards.test.ts
git commit -m "fix(security): guard payment admin actions, derive booking user server-side"
```

---

### Task 5: Guard payment settings and notice actions

**Files:**
- Modify: `src/actions/paymentSettings.ts`, `src/actions/notice.ts`
- Modify: `src/hooks/usePaymentSettings.ts`, `src/hooks/useNotice.ts`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Add failing cases**

In `actionGuards.test.ts` add imports and extend `ADMIN_ACTIONS`:

```ts
import * as paymentSettings from './paymentSettings'
import * as notice from './notice'
```

```ts
  ['updatePaymentSettingsAction', (t) => paymentSettings.updatePaymentSettingsAction(t, { gcash_name: 'x' })],
  ['uploadQRCodeAction', (t) => paymentSettings.uploadQRCodeAction(t, new FormData())],
  ['getNoticeAction', (t) => notice.getNoticeAction(t)],
  ['updateNoticeAction', (t) => notice.updateNoticeAction(t, {})],
```

If `{ gcash_name: 'x' }` or `{}` don't satisfy `UpdatePaymentSettingsData` / `UpdateNoticeData`, use `{} as never` — vitest does not type-check, but keep `tsc` clean.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/actions/actionGuards.test.ts`
Expected: FAIL on the 4 new cases.

- [ ] **Step 3: Guard the actions**

`src/actions/paymentSettings.ts` — add `import { requireAdmin } from '@/lib/actionAuth'` and:

```ts
export async function updatePaymentSettingsAction(
  accessToken: string,
  data: UpdatePaymentSettingsData
): Promise<PaymentSettingsResult> {
  await requireAdmin(accessToken)
  const settings = await updatePaymentSettings(data)
```

```ts
export async function uploadQRCodeAction(
  accessToken: string,
  formData: FormData
): Promise<PaymentSettingsResult> {
  await requireAdmin(accessToken)
  const file = formData.get('file') as File
```

`src/actions/notice.ts` — add `import { requireAdmin } from '@/lib/actionAuth'` and:

```ts
export async function getNoticeAction(accessToken: string): Promise<Notice> {
  await requireAdmin(accessToken)
  return getNotice()
}
```

```ts
export async function updateNoticeAction(accessToken: string, data: UpdateNoticeData): Promise<NoticeResult> {
  await requireAdmin(accessToken)
  const notice = await updateNotice(data)
```

- [ ] **Step 4: Update hooks**

`src/hooks/usePaymentSettings.ts` — add `import { getAccessToken } from '@/lib/accessToken'`:

```ts
    mutationFn: async (data: UpdatePaymentSettingsData) => updatePaymentSettingsAction(await getAccessToken(), data),
```

```ts
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return uploadQRCodeAction(await getAccessToken(), formData)
    },
```

`src/hooks/useNotice.ts` — add `import { getAccessToken } from '@/lib/accessToken'`:

```ts
    queryFn: async () => getNoticeAction(await getAccessToken()),
```

```ts
    mutationFn: async (data: UpdateNoticeData) => updateNoticeAction(await getAccessToken(), data),
```

- [ ] **Step 5: Test and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/actions/paymentSettings.ts src/actions/notice.ts src/hooks/usePaymentSettings.ts src/hooks/useNotice.ts src/actions/actionGuards.test.ts
git commit -m "fix(security): require admin session for payment settings and notice actions"
```

---

### Task 6: Customer actions use the verified user, not a browser-supplied id

**Files:**
- Modify: `src/actions/bookings.ts`, `src/actions/profile.ts`
- Modify: `src/lib/bookingService.ts` (new `getPendingRescheduleRequestsByUser`)
- Modify: `src/hooks/useBookings.ts`, `src/hooks/useProfile.ts`
- Modify: `src/components/AuthProvider.tsx`, `src/app/profile/page.tsx`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `actionGuards.test.ts`:

```ts
import * as profile from './profile'
import * as profileService from '@/lib/profileService'

type UserCall = [name: string, call: (token: string) => Promise<unknown>]

const USER_ACTIONS: UserCall[] = [
  ['getMyBookingsAction', (t) => bookings.getMyBookingsAction(t)],
  ['cancelBookingGroupAction', (t) => bookings.cancelBookingGroupAction(t, 'g1', null)],
  ['createRescheduleRequestAction', (t) => bookings.createRescheduleRequestAction(t, 'g1', null, '2026-12-01', ['08:00 - 09:00'])],
  ['getMyPendingRescheduleRequestsAction', (t) => bookings.getMyPendingRescheduleRequestsAction(t)],
  ['getMyProfileAction', (t) => profile.getMyProfileAction(t)],
  ['upsertMyProfileAction', (t) => profile.upsertMyProfileAction(t, {})],
]

describe('customer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(bookingService.isDateClosed).mockResolvedValue(false)
  })

  it.each(USER_ACTIONS)('%s rejects a missing token', async (_name, call) => {
    await expect(call('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('uses the user id from the token, not an argument', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.cancelBookingGroup).mockResolvedValue({ success: false, error: 'x' })
    await bookings.cancelBookingGroupAction('tok', 'g1', null)
    expect(bookingService.cancelBookingGroup).toHaveBeenCalledWith('g1', null, 'u1')
  })

  it('getMyBookingsAction reads the caller\'s bookings', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(bookingService.getBookingsByUserId).mockResolvedValue([])
    await bookings.getMyBookingsAction('tok')
    expect(bookingService.getBookingsByUserId).toHaveBeenCalledWith('u1')
  })

  it('isCurrentUserAdminAction is false when signed out', async () => {
    await expect(profile.isCurrentUserAdminAction('')).resolves.toEqual({ isAdmin: false, role: null })
  })

  it('isCurrentUserAdminAction reports the caller\'s role', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    await expect(profile.isCurrentUserAdminAction('tok')).resolves.toEqual({ isAdmin: true, role: 'admin' })
  })

  it('upsertMyProfileAction writes to the caller\'s profile', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.mocked(profileService.upsertProfile).mockResolvedValue({ user_id: 'u1' } as never)
    await profile.upsertMyProfileAction('tok', { name: 'N' } as never)
    expect(profileService.upsertProfile).toHaveBeenCalledWith('u1', { name: 'N' })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/actions/actionGuards.test.ts`
Expected: FAIL (new functions not defined / old signatures).

- [ ] **Step 3: Add the per-user reschedule query**

In `src/lib/bookingService.ts`, below `getPendingRescheduleRequests` (~line 738):

```ts
/**
 * Pending reschedule requests for one user (profile page).
 */
export async function getPendingRescheduleRequestsByUser(userId: string): Promise<RescheduleRequest[]> {
  const { data, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('status', 'pending')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user reschedule requests:', error)
    return []
  }

  return data || []
}
```

- [ ] **Step 4: Update customer actions in `src/actions/bookings.ts`**

Change the import `import { requireAdmin } from '@/lib/actionAuth'` to `import { requireAdmin, requireUser } from '@/lib/actionAuth'`, add `getPendingRescheduleRequestsByUser` to the `@/lib/bookingService` import, then replace `getBookingsByUserIdAction`, `cancelBookingGroupAction` and `createRescheduleRequestAction` with:

```ts
/**
 * Get the signed-in user's bookings
 */
export async function getMyBookingsAction(accessToken: string): Promise<Booking[]> {
  const userId = await requireUser(accessToken)
  return getBookingsByUserId(userId)
}

/**
 * Cancel a booking group (all slots in the same order) owned by the signed-in user
 * Calculates cancellation fee based on timing:
 * - Free cancellation: > 24 hours before booking
 * - P100/slot fee: <= 24 hours before booking
 */
export async function cancelBookingGroupAction(
  accessToken: string,
  bookingGroupId: string | null,
  legacyBookingId: string | null
): Promise<CancelBookingResult> {
  const userId = await requireUser(accessToken)
  const result = await cancelBookingGroup(bookingGroupId, legacyBookingId, userId)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * Create a reschedule request for the signed-in user's booking.
 * Does NOT move the booking — admin must approve or reject.
 */
export async function createRescheduleRequestAction(
  accessToken: string,
  bookingGroupId: string | null,
  legacyBookingId: string | null,
  newDate: string,
  newTimeSlots: string[]
): Promise<RescheduleBookingResult> {
  const userId = await requireUser(accessToken)

  const isClosed = await isDateClosed(newDate)
  if (isClosed) {
    return { success: false, error: 'The court is closed on that date. Please select another date.' }
  }

  const result = await createRescheduleRequest(bookingGroupId, legacyBookingId, userId, newDate, newTimeSlots)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')
  }

  return result
}

/**
 * The signed-in user's pending reschedule requests (profile page).
 */
export async function getMyPendingRescheduleRequestsAction(accessToken: string): Promise<RescheduleRequest[]> {
  const userId = await requireUser(accessToken)
  return getPendingRescheduleRequestsByUser(userId)
}
```

(`cancelBookingGroup` and `createRescheduleRequest` in the service already check that every booking belongs to `userId`, so passing the verified id closes the hole.)

- [ ] **Step 5: Rewrite `src/actions/profile.ts`**

```ts
'use server'

import { getProfileByUserId, upsertProfile } from '@/lib/profileService'
import { ProfileResult, UpdateProfileData, UserRole } from '@/types/profile'
import { getUserIdFromToken, requireUser } from '@/lib/actionAuth'

export interface IsAdminResult {
  isAdmin: boolean
  role: UserRole | null
}

/**
 * Role of the signed-in caller (false/null when signed out)
 */
export async function isCurrentUserAdminAction(accessToken: string): Promise<IsAdminResult> {
  try {
    const userId = await getUserIdFromToken(accessToken)
    if (!userId) return { isAdmin: false, role: null }

    const profile = await getProfileByUserId(userId)
    if (!profile) return { isAdmin: false, role: null }

    return { isAdmin: profile.role === 'admin', role: profile.role }
  } catch (error) {
    console.error('Error in isCurrentUserAdminAction:', error)
    return { isAdmin: false, role: null }
  }
}

export async function getMyProfileAction(accessToken: string): Promise<ProfileResult> {
  const userId = await requireUser(accessToken)
  try {
    const profile = await getProfileByUserId(userId)

    if (!profile) {
      return { success: false, error: 'Profile not found' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in getMyProfileAction:', error)
    return { success: false, error: 'Failed to fetch profile' }
  }
}

export async function upsertMyProfileAction(
  accessToken: string,
  data: UpdateProfileData
): Promise<ProfileResult> {
  const userId = await requireUser(accessToken)
  try {
    const profile = await upsertProfile(userId, data)

    if (!profile) {
      return { success: false, error: 'Failed to save profile' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in upsertMyProfileAction:', error)
    return { success: false, error: 'Failed to save profile' }
  }
}
```

Check `UpdateProfileData` cannot set `role`: run `grep -n "UpdateProfileData" -A 8 src/types/profile.ts`. If it includes `role`, strip it in `upsertMyProfileAction` before calling the service: `const { role: _ignored, ...safe } = data as UpdateProfileData & { role?: unknown }` and pass `safe`.

- [ ] **Step 6: Update `src/hooks/useProfile.ts`**

Replace imports and hooks (delete `useUpdateProfile`, which has no callers):

```ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyProfileAction, upsertMyProfileAction } from '@/actions/profile'
import { UpdateProfileData } from '@/types/profile'
import { useAuth } from '@/components/AuthProvider'
import { getAccessToken } from '@/lib/accessToken'

const PROFILE_QUERY_KEY = 'profile'

export function useProfile() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: [PROFILE_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return null
      const result = await getMyProfileAction(await getAccessToken())
      if (result.success && result.profile) {
        return result.profile
      }
      return null
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpsertProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id

  return useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      if (!userId) throw new Error('User not authenticated')
      const result = await upsertMyProfileAction(await getAccessToken(), data)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save profile')
      }
      return result.profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY, userId] })
    },
  })
}
```

(Keep any other exports that existed in the file after line 90 — check with `grep -n "^export" src/hooks/useProfile.ts` before replacing.)

- [ ] **Step 7: Update `src/hooks/useBookings.ts` customer hooks**

Update imports (`getBookingsByUserIdAction` → `getMyBookingsAction`, add `getMyPendingRescheduleRequestsAction`), then:

```ts
/**
 * Hook to fetch the signed-in user's bookings
 */
export function useUserBookings(userId: string | undefined) {
  return useQuery<Booking[]>({
    queryKey: ['userBookings', userId],
    queryFn: async () => getMyBookingsAction(await getAccessToken()),
    enabled: !!userId,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
  })
}
```

```ts
// useCancelBookingGroup
    mutationFn: async ({
      bookingGroupId,
      legacyBookingId,
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
    }) => cancelBookingGroupAction(await getAccessToken(), bookingGroupId, legacyBookingId),
```

```ts
// useCreateRescheduleRequest
    mutationFn: async ({
      bookingGroupId,
      legacyBookingId,
      newDate,
      newTimeSlots,
    }: {
      bookingGroupId: string | null
      legacyBookingId: string | null
      newDate: string
      newTimeSlots: string[]
    }) => createRescheduleRequestAction(await getAccessToken(), bookingGroupId, legacyBookingId, newDate, newTimeSlots),
```

Add a new hook below `usePendingRescheduleRequests`:

```ts
/**
 * Hook to fetch the signed-in user's pending reschedule requests (profile page).
 */
export function useMyPendingRescheduleRequests(userId: string | undefined) {
  return useQuery<RescheduleRequest[]>({
    queryKey: ['pendingRescheduleRequests', 'mine', userId],
    queryFn: async () => getMyPendingRescheduleRequestsAction(await getAccessToken()),
    enabled: !!userId,
    staleTime: 30 * 1000,
    gcTime: 30 * 1000,
  })
}
```

(The key starts with `'pendingRescheduleRequests'`, so the existing invalidations in `useCreateRescheduleRequest` etc. also refresh it.)

- [ ] **Step 8: Update `src/app/profile/page.tsx`**

1. Import: replace `usePendingRescheduleRequests` with `useMyPendingRescheduleRequests`.
2. Line 23: `const { data: pendingRescheduleRequests = [] } = useMyPendingRescheduleRequests(user?.id)`
3. In the `pendingRescheduleGroupIds` memo, drop the `.filter((r) => r.user_id === user?.id)` line (the server already filters) and change deps to `[pendingRescheduleRequests]`.
4. Remove `userId: user.id` from the `cancelBookingGroup.mutateAsync({...})` call (line ~61) and from the `createRescheduleRequest.mutateAsync({...})` call (line ~90).

- [ ] **Step 9: Update `src/components/AuthProvider.tsx`**

Change the import to `import { isCurrentUserAdminAction } from '@/actions/profile'` and make `checkAdminStatus` take the session:

```ts
  // Check admin status when the session changes
  const checkAdminStatus = async (session: Session | null) => {
    if (!session?.user) {
      setIsAdmin(false)
      setRole(null)
      return
    }

    try {
      const result = await isCurrentUserAdminAction(session.access_token)
      setIsAdmin(result.isAdmin)
      setRole(result.role)
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
      setRole(null)
    }
  }
```

and both call sites become `checkAdminStatus(session).then(() => { ... })`.

- [ ] **Step 10: Test, type-check, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors except possibly the slot-occupancy work in Task 7 (none expected yet).

```bash
git add src/actions/bookings.ts src/actions/profile.ts src/lib/bookingService.ts src/hooks/useBookings.ts src/hooks/useProfile.ts src/app/profile/page.tsx src/components/AuthProvider.tsx src/actions/actionGuards.test.ts
git commit -m "fix(security): customer actions use the verified session user"
```

---

### Task 7: Public availability returns slot data only

**Files:**
- Modify: `src/types/booking.ts`, `src/lib/bookingService.ts`, `src/actions/bookings.ts`, `src/hooks/useBookings.ts`, `src/lib/timeSlotGenerator.ts:29`
- Modify: `src/actions/actionGuards.test.ts`

- [ ] **Step 1: Failing test**

Append to `actionGuards.test.ts`:

```ts
describe('getActiveBookingsByDateAction (public)', () => {
  it('returns slot occupancy only', async () => {
    const rows = [{ date: '2026-12-01', time_slot: '08:00 - 09:00', court_number: 1, booking_group_id: 'g1' }]
    vi.mocked(bookingService.getActiveSlotOccupancyByDate).mockResolvedValue(rows)
    await expect(bookings.getActiveBookingsByDateAction('2026-12-01')).resolves.toEqual(rows)
    expect(bookingService.getActiveBookingsByDate).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/actions/actionGuards.test.ts` → Expected: FAIL.

- [ ] **Step 2: Add the type**

In `src/types/booking.ts`, after the `Booking` interface:

```ts
/** Public view of an active booking: enough to compute availability, no personal data. */
export type SlotOccupancy = Pick<Booking, 'date' | 'time_slot' | 'court_number' | 'booking_group_id'>
```

- [ ] **Step 3: Add the query**

In `src/lib/bookingService.ts`, add `SlotOccupancy` to the `@/types/booking` import and below `getActiveBookingsByDate`:

```ts
/**
 * Active slot occupancy for a date (public availability; no personal data).
 */
export async function getActiveSlotOccupancyByDate(date: string): Promise<SlotOccupancy[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('date, time_slot, court_number, booking_group_id')
    .eq('date', date)
    .in('payment_status', ACTIVE_PAYMENT_STATUSES)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching slot occupancy:', error)
    return []
  }

  return (data || []) as SlotOccupancy[]
}
```

- [ ] **Step 4: Switch the action**

In `src/actions/bookings.ts`: replace `getActiveBookingsByDate` with `getActiveSlotOccupancyByDate` in the service import, add `SlotOccupancy` to the types import, and:

```ts
/**
 * Slots occupied on a date by active bookings (pending or confirmed).
 * Public: returns no personal data. Use this for slot availability checking.
 */
export async function getActiveBookingsByDateAction(date: string): Promise<SlotOccupancy[]> {
  return getActiveSlotOccupancyByDate(date)
}
```

- [ ] **Step 5: Hook and slot generator types**

`src/hooks/useBookings.ts` — `useActiveBookingsByDate` returns `useQuery<SlotOccupancy[]>` (add `SlotOccupancy` to the types import).

`src/lib/timeSlotGenerator.ts` line 29 — change the parameter type:

```ts
  bookings: Pick<Booking, 'date' | 'time_slot' | 'court_number'>[],
```

(It only reads `date`, `court_number`, `time_slot`; existing callers passing `Booking[]` still type-check.)

- [ ] **Step 6: Type-check callers**

Run: `npx tsc --noEmit`
Expected: no errors. Callers are `app/page.tsx:35`, `AdminBookingForm.tsx:52` and `RescheduleModal.tsx:46`; they read only `booking_group_id` plus the slot fields. If any caller reads another field, add that field to `SlotOccupancy` **only if it is not personal data**; otherwise stop and report.

- [ ] **Step 7: Test and commit**

Run: `npm test` → PASS.

```bash
git add src/types/booking.ts src/lib/bookingService.ts src/actions/bookings.ts src/hooks/useBookings.ts src/lib/timeSlotGenerator.ts src/actions/actionGuards.test.ts
git commit -m "fix(security): public availability returns slot data only"
```

---

### Task 8: Full verification and docs

**Files:**
- Modify: `CLAUDE.md` (Auth & Roles section)

- [ ] **Step 1: Automated checks**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 2: Inventory check — no unguarded admin action left**

Run: `grep -n "export async function" src/actions/*.ts`
Compare against the inventory table at the top of this plan. Every action marked **admin** must have `await requireAdmin(accessToken)` as its first statement; every customer action must call `requireUser`. Run: `grep -c "requireAdmin(accessToken)" src/actions/*.ts` — expected counts: bookings.ts 14, payment.ts 3, paymentSettings.ts 2, notice.ts 2.

- [ ] **Step 3: Manual test (local, port 3001)**

Local `.env` points at the **production** Supabase project, so use only read paths and an admin account; do not create real bookings.

Run: `env -u ANTHROPIC_API_KEY npm run dev -- -p 3001`

Check:
1. `/admin` as admin: Bookings, Pending Payments, Refunds, Payment Settings and Notice tabs load (data visible = token flows).
2. `/profile` as a normal user: booking history and pending-reschedule badges load.
3. Signed out on `/`: slot availability still renders for today and tomorrow.
4. Browser devtools → Network → the `/` POST for availability: response contains no `name`, `email` or `phone` fields.

- [ ] **Step 4: Update `CLAUDE.md`**

Under `### Auth & Roles`, add:

```markdown
- Server actions verify the caller on the server: protected actions take the Supabase `accessToken` as their first argument (hooks get it via `getAccessToken()` in `lib/accessToken.ts`). `lib/actionAuth.ts`: `requireAdmin(token)` for admin actions, `requireUser(token)` for user-scoped ones (user id comes from the token, never from an argument). Public actions return no personal data (`getActiveBookingsByDateAction` → `SlotOccupancy`, `getPaymentStatusAction` → id + status). `src/actions/actionGuards.test.ts` must list every protected action.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document server action auth"
```
