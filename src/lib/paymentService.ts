/**
 * Payment Service
 * Business logic for payment operations
 * 
 * Flow:
 * 1. User clicks "Book" -> Opens payment modal (no DB record)
 * 2. User clicks "I've Completed Payment" -> Creates booking with 'pending' status
 * 3. Admin confirms -> 'confirmed' status
 * 4. Admin rejects -> 'rejected' status
 */

import { supabase } from './supabase-server'
import { Booking } from '@/types/booking'
import { PaymentStatus, PaymentResult, PendingPaymentBooking } from '@/types/payment'
import { 
  calculatePaymentAmount, 
  HELD_PAYMENT_STATUSES,
  PENDING_VERIFICATION_STATUSES,
  CONFIRMED_PAYMENT_STATUSES,
} from './paymentConfig'
import { generateUniqueShortId, generateBookingGroupId } from './bookingIdGenerator'

/**
 * Create bookings when user submits payment
 * This is called when user clicks "I've Completed Payment"
 */
export async function createBookingWithPendingPayment(
  payload: {
    name: string
    phone: string
    email: string
    date: string
    timeSlots: string[]
    court_number: number
    players: number
    user_id?: string
  }
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  const amount = calculatePaymentAmount(payload.timeSlots.length, payload.players)

  // Generate IDs once for the entire booking order
  // All time slots share the same short_id and booking_group_id
  const shortId = await generateUniqueShortId()
  const bookingGroupId = generateBookingGroupId()

  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    time_slot: ts,
    court_number: payload.court_number,
    players: payload.players,
    user_id: payload.user_id || null,
    short_id: shortId,
    booking_group_id: bookingGroupId,
    payment_status: 'pending' as PaymentStatus,
    payment_amount: amount,
  }))

  const { data, error } = await supabase
    .from('bookings')
    .insert(rows)
    .select()

  if (error) {
    if (error.code === '23505') {
      return { 
        success: false, 
        error: 'One or more selected time slots are already booked. Please refresh and try again.' 
      }
    }
    return { success: false, error: error.message || 'Failed to create bookings' }
  }

  return { 
    success: true, 
    bookings: data,
  }
}

/**
 * Confirm payment (admin action)
 */
export async function confirmPayment(bookingIds: string[]): Promise<PaymentResult> {
  const { error } = await supabase
    .from('bookings')
    .update({ 
      payment_status: 'confirmed' as PaymentStatus,
      payment_confirmed_at: new Date().toISOString()
    })
    .in('id', bookingIds)
    .eq('payment_status', 'pending')

  if (error) {
    console.error('Error confirming payment:', error)
    return { success: false, error: 'Failed to confirm payment' }
  }

  return { success: true }
}

/**
 * Reject payment (admin action)
 */
export async function rejectPayment(bookingIds: string[]): Promise<PaymentResult> {
  const { error } = await supabase
    .from('bookings')
    .update({ payment_status: 'rejected' as PaymentStatus })
    .in('id', bookingIds)
    .eq('payment_status', 'pending')

  if (error) {
    console.error('Error rejecting payment:', error)
    return { success: false, error: 'Failed to reject payment' }
  }

  return { success: true }
}

/**
 * Get bookings awaiting admin verification
 */
export async function getPendingPayments(): Promise<PendingPaymentBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .in('payment_status', [...PENDING_VERIFICATION_STATUSES])
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching pending payments:', error)
    return []
  }

  return (data || []) as PendingPaymentBooking[]
}

/**
 * Get payment status for specific bookings
 */
export async function getPaymentStatus(bookingIds: string[]): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .in('id', bookingIds)

  if (error) {
    console.error('Error fetching payment status:', error)
    return []
  }

  return data || []
}

/**
 * Get a single booking by ID with payment info
 */
export async function getBookingWithPayment(bookingId: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (error) {
    console.error('Error fetching booking:', error)
    return null
  }

  return data
}

/**
 * Get slots that are occupied (pending or confirmed)
 * Used for slot availability checking
 */
export async function getOccupiedSlotsByDate(date: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('time_slot')
    .eq('date', date)
    .in('payment_status', [...HELD_PAYMENT_STATUSES, ...CONFIRMED_PAYMENT_STATUSES])

  if (error) {
    console.error('Error fetching occupied slots:', error)
    return []
  }

  return data?.map(b => b.time_slot) || []
}
