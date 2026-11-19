'use server'

import {
  getActiveBookingsByDate,
  getAllBookings,
  deleteBooking,
  getDisabledSlotsByDate,
  addDisabledSlot,
  removeDisabledSlot,
  getAllDisabledSlots,
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

export async function getAllDisabledSlotsAction(accessToken: string): Promise<DisabledSlot[]> {
  await requireAdmin(accessToken)
  return getAllDisabledSlots()
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
