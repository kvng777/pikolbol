import { supabase } from './supabase-server'
import { Booking, BookingFormData, CreateBookingResult, DisabledSlot, ClosedDate, CancelBookingResult } from '@/types/booking'
import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from './constants'
import { HELD_PAYMENT_STATUSES, CONFIRMED_PAYMENT_STATUSES } from './paymentConfig'
import { sendAdminRefundAlertEmail, sendUserRefundCompletedEmail } from './emailService'

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
 * Parse booking date and time_slot into a Date object
 * time_slot format is expected to be "HH:MM AM/PM - HH:MM AM/PM" (e.g., "6:00 AM - 7:00 AM")
 */
function parseBookingDateTime(date: string, timeSlot: string): Date {
  // Extract the start time from the time_slot (e.g., "6:00 AM" from "6:00 AM - 7:00 AM")
  const startTime = timeSlot.split(' - ')[0].trim()
  
  // Parse the time
  const timeMatch = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!timeMatch) {
    // Fallback: return start of the booking date
    return new Date(date)
  }

  let hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const period = timeMatch[3].toUpperCase()

  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12
  } else if (period === 'AM' && hours === 12) {
    hours = 0
  }

  const bookingDate = new Date(date)
  bookingDate.setHours(hours, minutes, 0, 0)
  
  return bookingDate
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
