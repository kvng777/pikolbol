/**
 * Payment Service
 * Business logic for payment operations
 */

import { supabase } from './supabase-server'
import { Booking } from '@/types/booking'
import { PaymentStatus, PaymentResult, PendingPaymentBooking } from '@/types/payment'
import { 
  calculatePaymentAmount, 
  calculatePaymentDeadline, 
  HELD_PAYMENT_STATUSES,
  PENDING_VERIFICATION_STATUSES,
  DEFAULT_PAYMENT_TIMEOUT_MINUTES 
} from './paymentConfig'

/**
 * Create bookings with awaiting_payment status
 * User has confirmed booking, now needs to pay
 */
export async function createBookingsWithPayment(
  payload: {
    name: string
    phone: string
    email: string
    date: string
    timeSlots: string[]
    court_number: number
    players: number
    user_id?: string
  },
  timeoutMinutes: number = DEFAULT_PAYMENT_TIMEOUT_MINUTES
): Promise<{ success: boolean; bookings?: Booking[]; error?: string; paymentDeadline?: string }> {
  const now = new Date()
  const deadline = calculatePaymentDeadline(now, timeoutMinutes)
  const amount = calculatePaymentAmount(payload.timeSlots.length, payload.players)

  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    time_slot: ts,
    court_number: payload.court_number,
    players: payload.players,
    user_id: payload.user_id || null,
    payment_status: 'awaiting_payment' as PaymentStatus, // User needs to pay
    payment_deadline: deadline.toISOString(),
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
    paymentDeadline: deadline.toISOString()
  }
}

/**
 * Mark payment as submitted (user says they paid)
 * Changes from awaiting_payment -> pending (now visible in admin Pending Payments)
 */
export async function markPaymentSubmitted(bookingIds: string[]): Promise<PaymentResult> {
  const { error } = await supabase
    .from('bookings')
    .update({ payment_status: 'pending' as PaymentStatus })
    .in('id', bookingIds)
    .eq('payment_status', 'awaiting_payment')

  if (error) {
    console.error('Error marking payment as submitted:', error)
    return { success: false, error: 'Failed to update payment status' }
  }

  return { success: true }
}

/**
 * Confirm payment (admin action)
 * Only from 'pending' status (user has submitted payment)
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
 * Only from 'pending' status
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
 * Expire overdue payments
 * Call this periodically or on each relevant request
 */
export async function expireOverduePayments(): Promise<{ expiredCount: number; error?: string }> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .update({ payment_status: 'expired' as PaymentStatus })
    .in('payment_status', HELD_PAYMENT_STATUSES)
    .lt('payment_deadline', now)
    .select('id')

  if (error) {
    console.error('Error expiring payments:', error)
    return { expiredCount: 0, error: 'Failed to expire overdue payments' }
  }

  return { expiredCount: data?.length || 0 }
}

/**
 * Get bookings awaiting admin verification (user has submitted payment)
 * Only shows 'pending' status - where user clicked "I've Completed Payment"
 */
export async function getPendingPayments(): Promise<PendingPaymentBooking[]> {
  // First, expire any overdue payments
  await expireOverduePayments()

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
  // First, expire any overdue payments
  await expireOverduePayments()

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
  // First, check if this booking should be expired
  await expireOverduePayments()

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
 * Check if any slots are held by pending payments for a given date
 * Used for slot availability checking
 */
export async function getHeldSlotsByDate(date: string): Promise<string[]> {
  // Expire overdue payments first
  await expireOverduePayments()

  const { data, error } = await supabase
    .from('bookings')
    .select('time_slot')
    .eq('date', date)
    .in('payment_status', [...HELD_PAYMENT_STATUSES, 'confirmed'])

  if (error) {
    console.error('Error fetching held slots:', error)
    return []
  }

  return data?.map(b => b.time_slot) || []
}
