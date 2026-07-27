import { supabase } from './supabase-server'
import {
  Booking,
  BookingFormData,
  CreateBookingResult,
  DisabledSlot,
  ClosedDate,
  CancelBookingResult,
  RescheduleBookingResult,
  RescheduleRequest,
  AdminBookingPayload,
} from '@/types/booking'
import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from './constants'
import {
  HELD_PAYMENT_STATUSES,
  CONFIRMED_PAYMENT_STATUSES,
  calculatePaymentAmount,
} from './paymentConfig'
import { generateUniqueShortId, generateBookingGroupId } from './bookingIdGenerator'
import {
  sendAdminRefundAlertEmail,
  sendUserRefundCompletedEmail,
  sendRescheduleNotificationEmail,
  sendRescheduleApprovedEmail,
  sendRescheduleRejectedEmail,
} from './emailService'
import { getPaymentSettings } from './paymentSettingsService'

// Re-export constants for backwards compatibility with server-side code
export { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT }

// Payment statuses that indicate a slot is occupied (pending or confirmed)
const ACTIVE_PAYMENT_STATUSES = [...HELD_PAYMENT_STATUSES, ...CONFIRMED_PAYMENT_STATUSES]

/**
 * Get bookings by date - returns ALL bookings regardless of payment status
 * Use getActiveBookingsByDate for slot availability checking
 */
export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('date', date)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching bookings:', error)
    return []
  }

  return data || []
}

/**
 * Get ACTIVE bookings by date - only bookings that occupy slots
 * (pending or confirmed)
 */
export async function getActiveBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('date', date)
    .in('payment_status', ACTIVE_PAYMENT_STATUSES)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching active bookings:', error)
    return []
  }

  return data || []
}

/**
 * Get all bookings - returns ALL bookings regardless of payment status
 * For admin view that needs to see everything
 */
export async function getAllBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching all bookings:', error)
    return []
  }

  return data || []
}

/**
 * Get confirmed bookings only - for admin booking list
 */
export async function getConfirmedBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('payment_status', 'confirmed')
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching confirmed bookings:', error)
    return []
  }

  return data || []
}

export async function createBooking(booking: BookingFormData): Promise<CreateBookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      date: booking.date,
      time_slot: booking.timeSlot,
      court_number: booking.courtNumber,
      players: booking.players,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'This time slot has already been booked. Please select another slot.',
      }
    }
    return {
      success: false,
      error: error.message || 'Failed to create booking',
    }
  }

  return {
    success: true,
    booking: data,
  }
}

export async function createBookings(payload: { name: string; phone: string; email: string; date: string; timeSlots: string[]; court_number: number; players?: number; user_id?: string }): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    time_slot: ts,
    court_number: payload.court_number,
    players: payload.players,
    user_id: payload.user_id || null,
  }))

  const { data, error } = await supabase
    .from('bookings')
    .insert(rows)
    .select()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'One or more selected time slots are already booked. Please refresh and try again.' }
    }
    return { success: false, error: error.message || 'Failed to create bookings' }
  }

  return { success: true, bookings: data }
}

// ============================================================================
// Admin (manual) bookings
// ============================================================================

const MANUAL_COURT_NUMBER = 1
const MANUAL_DEFAULT_PLAYERS = 2

/**
 * Create a manual booking on behalf of a player (admin only).
 * Created as a single confirmed group, flagged is_manual, with no emails sent.
 */
export async function createAdminBooking(
  payload: AdminBookingPayload
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  if (!payload.name.trim()) {
    return { success: false, error: 'Player name is required' }
  }
  if (!payload.timeSlots || payload.timeSlots.length === 0) {
    return { success: false, error: 'Please select at least one time slot' }
  }

  const paddlesCount = Math.max(0, payload.paddles ?? 0)
  const needsBalls = payload.needsBalls ?? false
  const trainingBalls = payload.trainingBalls ?? false

  const amount = calculatePaymentAmount(payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {
    date: payload.date,
    paddles: paddlesCount,
    needsBalls,
    trainingBalls,
  })

  const shortId = await generateUniqueShortId()
  const bookingGroupId = generateBookingGroupId()
  const nowIso = new Date().toISOString()

  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name.trim(),
    phone: '',
    email: '',
    date: payload.date,
    time_slot: ts,
    court_number: MANUAL_COURT_NUMBER,
    players: MANUAL_DEFAULT_PLAYERS,
    paddles_count: paddlesCount,
    needs_balls: needsBalls,
    training_balls: trainingBalls,
    user_id: null,
    short_id: shortId,
    booking_group_id: bookingGroupId,
    payment_status: 'confirmed' as const,
    payment_amount: amount,
    payment_confirmed_at: nowIso,
    is_manual: true,
  }))

  const { data, error } = await supabase.from('bookings').insert(rows).select()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'One or more selected time slots are already booked.' }
    }
    return { success: false, error: error.message || 'Failed to create booking' }
  }

  return { success: true, bookings: data }
}

/**
 * Update an existing manual booking group (admin only).
 * Uses a "replace group" strategy: validate the target slots are free
 * (ignoring this group's own rows), then delete the group's rows and
 * re-insert with the same booking_group_id and short_id.
 * Editable anytime, including past/completed bookings. Manual bookings only.
 */
export async function updateAdminBooking(
  bookingGroupId: string,
  payload: AdminBookingPayload
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  if (!payload.name.trim()) {
    return { success: false, error: 'Player name is required' }
  }
  if (!payload.timeSlots || payload.timeSlots.length === 0) {
    return { success: false, error: 'Please select at least one time slot' }
  }

  // Load the existing group and verify it is a manual booking
  const existing = await getBookingsByGroupId(bookingGroupId)
  if (existing.length === 0) {
    return { success: false, error: 'Booking not found' }
  }
  if (!existing.every((b) => b.is_manual)) {
    return { success: false, error: 'Only manually-created bookings can be edited' }
  }

  // Preserve the original human-readable ID
  const shortId = existing[0].short_id || (await generateUniqueShortId())

  // Validate target slots are free, excluding this group's own rows
  const activeOnDate = await getActiveBookingsByDate(payload.date)
  const conflict = activeOnDate.find(
    (b) =>
      b.court_number === MANUAL_COURT_NUMBER &&
      b.booking_group_id !== bookingGroupId &&
      payload.timeSlots.includes(b.time_slot)
  )
  if (conflict) {
    return { success: false, error: `Time slot ${conflict.time_slot} is already booked.` }
  }

  const paddlesCount = Math.max(0, payload.paddles ?? 0)
  const needsBalls = payload.needsBalls ?? false
  const trainingBalls = payload.trainingBalls ?? false
  const amount = calculatePaymentAmount(payload.timeSlots, MANUAL_DEFAULT_PLAYERS, {
    date: payload.date,
    paddles: paddlesCount,
    needsBalls,
    trainingBalls,
  })

  // Replace the group's rows
  const { error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .eq('booking_group_id', bookingGroupId)

  if (deleteError) {
    return { success: false, error: deleteError.message || 'Failed to update booking' }
  }

  const nowIso = new Date().toISOString()
  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name.trim(),
    phone: '',
    email: '',
    date: payload.date,
    time_slot: ts,
    court_number: MANUAL_COURT_NUMBER,
    players: MANUAL_DEFAULT_PLAYERS,
    paddles_count: paddlesCount,
    needs_balls: needsBalls,
    training_balls: trainingBalls,
    user_id: null,
    short_id: shortId,
    booking_group_id: bookingGroupId,
    payment_status: 'confirmed' as const,
    payment_amount: amount,
    payment_confirmed_at: existing[0].payment_confirmed_at || nowIso,
    is_manual: true,
  }))

  const { data, error } = await supabase.from('bookings').insert(rows).select()

  if (error) {
    return { success: false, error: error.message || 'Failed to update booking' }
  }

  return { success: true, bookings: data }
}

export async function deleteBooking(id: string): Promise<{ success: boolean; error?: string }> {
  console.log('Deleting booking with id:', id)
  // Debug: check whether the booking exists and is accessible before attempting delete
  try {
    const existing = await getBookingById(id)
    console.log('Existing booking before delete:', existing)
  } catch (err) {
    console.log('Error fetching existing booking before delete:', err)
  }
  const { error, data } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)
    .select()

  console.log('Supabase delete result:', { error, data })

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  // Check if data is empty (no row deleted)
  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'No booking deleted. ID may be incorrect.',
    }
  }

  return { success: true }
}

// ============================================================================
// Reschedule Requests (approval-based workflow)
// ============================================================================

/**
 * Create a reschedule request (user action). Does NOT move the booking.
 * Admin must approve or reject. New slots are "held" while pending.
 */
export async function createRescheduleRequest(
  bookingGroupId: string | null,
  legacyBookingId: string | null,
  userId: string,
  newDate: string,
  newTimeSlots: string[]
): Promise<RescheduleBookingResult> {
  // 1. Fetch existing bookings
  let bookings: Booking[] = []
  if (bookingGroupId) {
    bookings = await getBookingsByGroupId(bookingGroupId)
  } else if (legacyBookingId) {
    const booking = await getBookingById(legacyBookingId)
    if (booking) bookings = [booking]
  }

  if (bookings.length === 0) {
    return { success: false, error: 'Booking not found' }
  }

  // 2. Verify ownership
  if (!bookings.every((b) => b.user_id === userId)) {
    return { success: false, error: 'You can only reschedule your own bookings' }
  }

  // 3. Must be confirmed
  if (bookings[0].payment_status !== 'confirmed') {
    return { success: false, error: 'Only confirmed bookings can be rescheduled' }
  }

  // 4. Must be in the future
  const hoursUntil = calculateHoursUntilBooking(bookings)
  if (hoursUntil < 0) {
    return { success: false, error: 'Cannot reschedule past bookings' }
  }

  // 5. Same slot count
  if (newTimeSlots.length !== bookings.length) {
    return {
      success: false,
      error: `Please select exactly ${bookings.length} time slot${bookings.length > 1 ? 's' : ''}`,
    }
  }

  // 6. Check no pending reschedule request already exists for this group
  const effectiveGroupId = bookingGroupId || bookings[0].booking_group_id
  const { data: existingRequests } = await supabase
    .from('reschedule_requests')
    .select('id')
    .eq('status', 'pending')
    .or(
      effectiveGroupId
        ? `booking_group_id.eq.${effectiveGroupId}`
        : `legacy_booking_id.eq.${legacyBookingId}`
    )
    .limit(1)

  if (existingRequests && existingRequests.length > 0) {
    return { success: false, error: 'A reschedule request is already pending for this booking. Please wait for admin to review it.' }
  }

  // 7. Check new slots are available (including held slots from other pending requests)
  const activeOnNewDate = await getActiveBookingsByDate(newDate)
  const heldSlots = await getHeldRescheduleSlotsByDate(newDate)

  const allOccupied = [
    ...activeOnNewDate
      .filter((b) => b.court_number === 1 && b.booking_group_id !== effectiveGroupId)
      .map((b) => b.time_slot),
    ...heldSlots,
  ]

  const conflict = newTimeSlots.find((ts) => allOccupied.includes(ts))
  if (conflict) {
    return { success: false, error: `Time slot ${conflict} is already booked.` }
  }

  // 8. Check disabled slots
  const disabledOnNewDate = await getDisabledSlotsByDate(newDate)
  const disabledConflict = disabledOnNewDate.find((s) => newTimeSlots.includes(s.time_slot))
  if (disabledConflict) {
    return { success: false, error: `Time slot ${disabledConflict.time_slot} is disabled by admin.` }
  }

  // 9. Insert the request
  const first = bookings[0]
  const sortedNewSlots = [...newTimeSlots].sort()
  const originalTimeSlots = bookings.map((b) => b.time_slot).sort()

  const { data: inserted, error: insertError } = await supabase
    .from('reschedule_requests')
    .insert({
      booking_group_id: effectiveGroupId,
      legacy_booking_id: legacyBookingId,
      user_id: userId,
      short_id: first.short_id || null,
      customer_name: first.name,
      customer_email: first.email,
      customer_phone: first.phone,
      original_date: first.date,
      original_time_slots: originalTimeSlots,
      new_date: newDate,
      new_time_slots: sortedNewSlots,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { success: false, error: insertError?.message || 'Failed to create reschedule request' }
  }

  // 10. Send admin notification email with approve/reject buttons
  try {
    await sendRescheduleNotificationEmail({
      requestId: inserted.id,
      userName: first.name,
      userEmail: first.email,
      userPhone: first.phone,
      shortId: first.short_id || undefined,
      oldDate: first.date,
      oldTimeSlots: originalTimeSlots.join(', '),
      newDate,
      newTimeSlots: sortedNewSlots.join(', '),
    })
  } catch (emailError) {
    console.error('Failed to send reschedule notification email:', emailError)
  }

  return { success: true, requestId: inserted.id }
}

/**
 * Approve a pending reschedule request (admin action).
 * Moves the booking to the new date/slots using replace-group strategy.
 */
export async function approveRescheduleRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return { success: false, error: 'Reschedule request not found' }
  }

  if (request.status !== 'pending') {
    return { success: false, error: `Request has already been ${request.status}` }
  }

  // 2. Fetch the original bookings
  let bookings: Booking[] = []
  if (request.booking_group_id) {
    bookings = await getBookingsByGroupId(request.booking_group_id)
  } else if (request.legacy_booking_id) {
    const booking = await getBookingById(request.legacy_booking_id)
    if (booking) bookings = [booking]
  }

  if (bookings.length === 0) {
    // Booking was cancelled or deleted since the request was made
    await supabase
      .from('reschedule_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', requestId)
    return { success: false, error: 'Original booking no longer exists' }
  }

  // 3. Verify new slots are still available (excluding this request's held slots)
  const activeOnNewDate = await getActiveBookingsByDate(request.new_date)
  const groupId = request.booking_group_id || bookings[0].booking_group_id
  const conflict = activeOnNewDate.find(
    (b) =>
      b.court_number === 1 &&
      b.booking_group_id !== groupId &&
      request.new_time_slots.includes(b.time_slot)
  )
  if (conflict) {
    return { success: false, error: `Time slot ${conflict.time_slot} is no longer available.` }
  }

  // 4. Replace-group: delete old rows, insert new ones
  const first = bookings[0]
  const shortId = first.short_id || null
  const effectiveGroupId = groupId || generateBookingGroupId()
  const nowIso = new Date().toISOString()
  const oldTimeSlots = bookings.map((b) => b.time_slot).sort()

  const bookingIds = bookings.map((b) => b.id)
  const { error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .in('id', bookingIds)

  if (deleteError) {
    return { success: false, error: deleteError.message || 'Failed to move booking' }
  }

  const sortedNewSlots = [...request.new_time_slots].sort()
  const rows = sortedNewSlots.map((ts: string, i: number) => ({
    name: first.name,
    phone: first.phone,
    email: first.email,
    date: request.new_date,
    time_slot: ts,
    court_number: first.court_number,
    players: first.players,
    paddles_count: first.paddles_count ?? 0,
    needs_balls: first.needs_balls ?? false,
    user_id: first.user_id,
    short_id: shortId,
    booking_group_id: effectiveGroupId,
    payment_status: 'confirmed' as const,
    payment_amount: first.payment_amount,
    payment_confirmed_at: first.payment_confirmed_at,
    gcash_reference: first.gcash_reference,
    is_manual: first.is_manual ?? false,
    rescheduled_from_date: request.original_date,
    rescheduled_from_time_slot: oldTimeSlots[i] ?? oldTimeSlots[0],
    rescheduled_at: nowIso,
  }))

  const { error: insertError } = await supabase.from('bookings').insert(rows).select()
  if (insertError) {
    return { success: false, error: insertError.message || 'Failed to move booking' }
  }

  // 5. Mark request as approved
  await supabase
    .from('reschedule_requests')
    .update({ status: 'approved', resolved_at: nowIso })
    .eq('id', requestId)

  // 6. Send user approval email
  try {
    await sendRescheduleApprovedEmail({
      recipientEmail: request.customer_email,
      recipientName: request.customer_name,
      shortId: request.short_id || undefined,
      oldDate: request.original_date,
      oldTimeSlots: (request.original_time_slots as string[]).join(', '),
      newDate: request.new_date,
      newTimeSlots: sortedNewSlots.join(', '),
    })
  } catch (emailError) {
    console.error('Failed to send reschedule approved email:', emailError)
  }

  return { success: true }
}

/**
 * Reject a pending reschedule request (admin action).
 * Booking stays unchanged. User is notified with admin contact info.
 */
export async function rejectRescheduleRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return { success: false, error: 'Reschedule request not found' }
  }

  if (request.status !== 'pending') {
    return { success: false, error: `Request has already been ${request.status}` }
  }

  // 2. Mark as rejected
  const nowIso = new Date().toISOString()
  await supabase
    .from('reschedule_requests')
    .update({ status: 'rejected', resolved_at: nowIso })
    .eq('id', requestId)

  // 3. Get admin phone from payment settings
  let adminPhone = ''
  try {
    const settings = await getPaymentSettings()
    adminPhone = settings?.gcash_number || ''
  } catch {
    console.error('Failed to fetch payment settings for admin phone')
  }

  // 4. Send user rejection email
  try {
    await sendRescheduleRejectedEmail({
      recipientEmail: request.customer_email,
      recipientName: request.customer_name,
      shortId: request.short_id || undefined,
      oldDate: request.original_date,
      oldTimeSlots: (request.original_time_slots as string[]).join(', '),
      newDate: request.new_date,
      newTimeSlots: (request.new_time_slots as string[]).join(', '),
      adminPhone,
    })
  } catch (emailError) {
    console.error('Failed to send reschedule rejected email:', emailError)
  }

  return { success: true }
}

/**
 * Get pending reschedule requests (for admin view).
 */
export async function getPendingRescheduleRequests(): Promise<RescheduleRequest[]> {
  const { data, error } = await supabase
    .from('reschedule_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching pending reschedule requests:', error)
    return []
  }

  return data || []
}

/**
 * Get time slots held by pending reschedule requests for a given date.
 * These slots should show as "booked" in the time slot picker.
 */
export async function getHeldRescheduleSlotsByDate(date: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('reschedule_requests')
    .select('new_time_slots')
    .eq('new_date', date)
    .eq('status', 'pending')

  if (error) {
    console.error('Error fetching held reschedule slots:', error)
    return []
  }

  // Flatten the arrays of time slots
  return (data || []).flatMap((r) => r.new_time_slots as string[])
}

/**
 * Cancel any pending reschedule request for a booking group.
 * Called automatically when a user cancels their booking.
 */
export async function cancelPendingRescheduleForGroup(
  bookingGroupId: string | null,
  legacyBookingId: string | null
): Promise<void> {
  if (!bookingGroupId && !legacyBookingId) return

  const filter = bookingGroupId
    ? supabase.from('reschedule_requests').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('booking_group_id', bookingGroupId)
    : supabase.from('reschedule_requests').update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('legacy_booking_id', legacyBookingId!)

  const { error } = await filter.eq('status', 'pending')

  if (error) {
    console.error('Error cancelling pending reschedule request:', error)
  }
}

export async function getDisabledSlotsByDate(date: string): Promise<DisabledSlot[]> {
  const { data, error } = await supabase
    .from('disabled_slots')
    .select('*')
    .eq('date', date)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching disabled slots:', error)
    return []
  }

  return data || []
}

export async function addDisabledSlot(date: string, timeSlot: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('disabled_slots')
    .insert({ date, time_slot: timeSlot })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function removeDisabledSlot(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('disabled_slots')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function getAllDisabledSlots(): Promise<DisabledSlot[]> {
  const { data, error } = await supabase
    .from('disabled_slots')
    .select('*')
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching all disabled slots:', error)
    return []
  }

  return data || []
}

export async function getClosedDates(): Promise<ClosedDate[]> {
  const { data, error } = await supabase
    .from('closed_dates')
    .select('*')
    .order('start_date', { ascending: false })

  if (error) {
    console.error('Error fetching closed dates:', error)
    return []
  }

  return data || []
}

export async function addClosedDate(startDate: string, endDate: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('closed_dates')
    .insert({ start_date: startDate, end_date: endDate, reason })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function removeClosedDate(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('closed_dates')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function isDateClosed(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('closed_dates')
    .select('id')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1)

  if (error) {
    console.error('Error checking closed date:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching booking by ID:', error)
    return null
  }

  return data || null
}

/**
 * Get all bookings for a specific user
 * Includes all payment statuses so user can see their full history
 */
export async function getBookingsByUserId(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching user bookings:', error)
    return []
  }

  return data || []
}

/**
 * Check if a booking can be cancelled based on the 24-hour policy
 * Returns true if the booking is more than CANCELLATION_HOURS_BEFORE hours away
 */
export function canCancelBooking(booking: Booking): boolean {
  const bookingDateTime = parseBookingDateTime(booking.date, booking.time_slot)
  const now = new Date()
  const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  
  return hoursUntilBooking >= CANCELLATION_HOURS_BEFORE
}

/**
 * Parse booking date and time_slot into a Date object in Philippines timezone (UTC+8)
 * Handles both formats:
 *   - 24-hour: "17:00-18:00" or "17:00 - 18:00"
 *   - 12-hour: "6:00 AM - 7:00 AM" or "6:00 PM - 7:00 PM"
 */
function parseBookingDateTime(date: string, timeSlot: string): Date {
  // Extract the start time from the time_slot (split on '-' with optional spaces)
  const startTime = timeSlot.split('-')[0].trim()
  
  let hours = 0
  let minutes = 0
  
  // Try to parse 24-hour format first (e.g., "17:00")
  const match24h = startTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24h) {
    hours = parseInt(match24h[1], 10)
    minutes = parseInt(match24h[2], 10)
  } else {
    // Try to parse 12-hour format (e.g., "6:00 PM")
    const match12h = startTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match12h) {
      hours = parseInt(match12h[1], 10)
      minutes = parseInt(match12h[2], 10)
      const period = match12h[3].toUpperCase()
      
      if (period === 'PM' && hours !== 12) {
        hours += 12
      } else if (period === 'AM' && hours === 12) {
        hours = 0
      }
    } else {
      // Fallback: return start of the booking date in PH timezone (midnight)
      // Parse as Philippines time by constructing explicit ISO string
      return new Date(`${date}T00:00:00+08:00`)
    }
  }

  // Construct the datetime explicitly in Philippines timezone (UTC+8)
  // Format: YYYY-MM-DDTHH:MM:SS+08:00
  const paddedHours = hours.toString().padStart(2, '0')
  const paddedMinutes = minutes.toString().padStart(2, '0')
  const isoString = `${date}T${paddedHours}:${paddedMinutes}:00+08:00`
  
  return new Date(isoString)
}

/**
 * Cancel a booking by ID
 * Only allows cancellation if the user owns the booking and it's more than 24 hours away
 */
export async function cancelBooking(bookingId: string, userId: string): Promise<CancelBookingResult> {
  // First, fetch the booking to verify ownership and check cancellation policy
  const booking = await getBookingById(bookingId)
  
  if (!booking) {
    return { success: false, error: 'Booking not found' }
  }

  if (booking.user_id !== userId) {
    return { success: false, error: 'You can only cancel your own bookings' }
  }

  if (!canCancelBooking(booking)) {
    return { 
      success: false, 
      error: `Bookings can only be cancelled at least ${CANCELLATION_HOURS_BEFORE} hours before the scheduled time` 
    }
  }

  // Delete the booking
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)
    .eq('user_id', userId) // Extra safety check

  if (error) {
    console.error('Error cancelling booking:', error)
    return { success: false, error: 'Failed to cancel booking' }
  }

  return { success: true }
}

/**
 * Calculate hours until the earliest booking in a group
 */
export function calculateHoursUntilBooking(bookings: Booking[]): number {
  if (bookings.length === 0) return 0
  
  // Find the earliest time slot
  const sortedBookings = [...bookings].sort((a, b) => 
    a.time_slot.localeCompare(b.time_slot)
  )
  const earliest = sortedBookings[0]
  
  const bookingDateTime = parseBookingDateTime(earliest.date, earliest.time_slot)
  const now = new Date()
  return (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
}

/**
 * Calculate cancellation fee and refund amount based on timing
 * - Free cancellation: > 24 hours before booking (full refund)
 * - P100/slot fee: <= 24 hours before booking (partial refund)
 */
export function calculateCancellationFee(
  totalAmount: number,
  numberOfSlots: number,
  hoursUntilBooking: number
): { cancellationFee: number; refundAmount: number } {
  if (hoursUntilBooking > CANCELLATION_HOURS_BEFORE) {
    // Free cancellation - full refund
    return { cancellationFee: 0, refundAmount: totalAmount }
  } else {
    // Fee applies: P100 per slot
    const fee = numberOfSlots * CANCELLATION_FEE_PER_SLOT
    const refund = Math.max(0, totalAmount - fee)
    return { cancellationFee: fee, refundAmount: refund }
  }
}

/**
 * Get all bookings in a booking group
 */
export async function getBookingsByGroupId(bookingGroupId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_group_id', bookingGroupId)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching bookings by group ID:', error)
    return []
  }

  return data || []
}

/**
 * Cancel all bookings in a booking group
 * Calculates cancellation fee based on timing and updates records
 */
export async function cancelBookingGroup(
  bookingGroupId: string | null,
  legacyBookingId: string | null,
  userId: string
): Promise<CancelBookingResult> {
  let bookings: Booking[] = []

  // Fetch bookings - either by group ID or legacy single booking
  if (bookingGroupId) {
    bookings = await getBookingsByGroupId(bookingGroupId)
  } else if (legacyBookingId) {
    const booking = await getBookingById(legacyBookingId)
    if (booking) bookings = [booking]
  }

  if (bookings.length === 0) {
    return { success: false, error: 'Booking not found' }
  }

  // Verify user owns all bookings in the group
  const userOwnsAll = bookings.every(b => b.user_id === userId)
  if (!userOwnsAll) {
    return { success: false, error: 'You can only cancel your own bookings' }
  }

  // Check payment status - only confirmed bookings can be cancelled for refund
  const firstBooking = bookings[0]
  if (firstBooking.payment_status !== 'confirmed') {
    return { success: false, error: 'Only confirmed bookings can be cancelled' }
  }

  // Calculate hours until the earliest booking
  const hoursUntilBooking = calculateHoursUntilBooking(bookings)
  
  // Bookings in the past cannot be cancelled
  if (hoursUntilBooking < 0) {
    return { success: false, error: 'Cannot cancel past bookings' }
  }

  // Calculate cancellation fee and refund
  const totalAmount = firstBooking.payment_amount || 0
  const numberOfSlots = bookings.length
  const { cancellationFee, refundAmount } = calculateCancellationFee(
    totalAmount,
    numberOfSlots,
    hoursUntilBooking
  )

  // Determine refund status (only 'pending' if there's actually a refund to process)
  const refundStatus = refundAmount > 0 ? 'pending' : null

  // Get all booking IDs to update
  const bookingIds = bookings.map(b => b.id)

  // Update all bookings in the group
  const { error } = await supabase
    .from('bookings')
    .update({
      payment_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_fee: cancellationFee,
      refund_amount: refundAmount,
      refund_status: refundStatus,
    })
    .in('id', bookingIds)
    .eq('user_id', userId) // Extra safety check

  if (error) {
    console.error('Error cancelling booking group:', error)
    return { success: false, error: 'Failed to cancel booking' }
  }

  // Auto-cancel any pending reschedule request for this group (frees held slots)
  try {
    await cancelPendingRescheduleForGroup(bookingGroupId, legacyBookingId)
  } catch (err) {
    console.error('Error auto-cancelling pending reschedule request:', err)
  }

  // Send admin alert email if there's a refund to process
  if (refundAmount > 0) {
    try {
      await sendAdminRefundAlertEmail({
        userName: firstBooking.name,
        userEmail: firstBooking.email,
        userPhone: firstBooking.phone,
        bookingDate: firstBooking.date,
        bookingTime: bookings.map(b => b.time_slot).join(', '),
        originalAmount: totalAmount,
        cancellationFee,
        refundAmount,
        shortId: firstBooking.short_id || undefined,
      })
    } catch (emailError) {
      // Log but don't fail the cancellation if email fails
      console.error('Failed to send admin refund alert email:', emailError)
    }
  }

  return { 
    success: true, 
    cancellationFee, 
    refundAmount 
  }
}

/**
 * Get all bookings with pending refunds (for admin)
 */
export async function getPendingRefunds(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('refund_status', 'pending')
    .order('cancelled_at', { ascending: false })

  if (error) {
    console.error('Error fetching pending refunds:', error)
    return []
  }

  return data || []
}

/**
 * Mark a booking group's refund as completed (admin action)
 * Sends confirmation email to the user
 */
export async function markRefundCompleted(
  bookingGroupId: string | null,
  legacyBookingId: string | null
): Promise<{ success: boolean; error?: string }> {
  // First, fetch the booking details before updating (needed for email)
  let bookingsToNotify: Booking[] = []
  
  if (bookingGroupId) {
    bookingsToNotify = await getBookingsByGroupId(bookingGroupId)
    
    const { error } = await supabase
      .from('bookings')
      .update({ refund_status: 'completed' })
      .eq('booking_group_id', bookingGroupId)

    if (error) {
      console.error('Error marking refund completed:', error)
      return { success: false, error: error.message }
    }
  } else if (legacyBookingId) {
    const booking = await getBookingById(legacyBookingId)
    if (booking) bookingsToNotify = [booking]
    
    const { error } = await supabase
      .from('bookings')
      .update({ refund_status: 'completed' })
      .eq('id', legacyBookingId)

    if (error) {
      console.error('Error marking refund completed:', error)
      return { success: false, error: error.message }
    }
  } else {
    return { success: false, error: 'No booking identifier provided' }
  }

  // Send user refund completed email
  if (bookingsToNotify.length > 0) {
    const first = bookingsToNotify[0]
    try {
      await sendUserRefundCompletedEmail({
        recipientEmail: first.email,
        recipientName: first.name,
        bookingDate: first.date,
        bookingTime: bookingsToNotify.map(b => b.time_slot).join(', '),
        originalAmount: first.payment_amount || 0,
        cancellationFee: first.cancellation_fee || 0,
        refundAmount: first.refund_amount || 0,
        shortId: first.short_id || undefined,
      })
    } catch (emailError) {
      // Log but don't fail the operation if email fails
      console.error('Failed to send user refund completed email:', emailError)
    }
  }

  return { success: true }
}
