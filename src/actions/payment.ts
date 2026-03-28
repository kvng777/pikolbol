'use server'

import { revalidatePath } from 'next/cache'
import {
  createBookingWithPendingPayment,
  confirmPayment,
  rejectPayment,
  getPendingPayments,
  getPaymentStatus,
  getBookingWithPayment,
} from '@/lib/paymentService'
import { getPaymentSettings } from '@/lib/paymentSettingsService'
import { isDateClosed } from '@/lib/bookingService'
import { Booking } from '@/types/booking'
import { PaymentResult, PendingPaymentBooking, PaymentInfo } from '@/types/payment'
import { sendPaymentConfirmationEmail, sendPaymentRejectionEmail } from '@/lib/emailService'

/**
 * Submit payment - creates booking with pending status
 * Called when user clicks "I've Completed Payment"
 */
export async function submitPaymentAction(
  payload: {
    name: string
    phone: string
    email: string
    date: string
    timeSlots: string[]
    courtNumber: number
    players: number
    user_id?: string
  }
): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  // Check if date is closed
  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date.' }
  }

  const result = await createBookingWithPendingPayment({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    timeSlots: payload.timeSlots,
    court_number: payload.courtNumber,
    players: payload.players,
    user_id: payload.user_id,
  })

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

/**
 * Confirm payment (admin action)
 */
export async function confirmPaymentAction(bookingIds: string[]): Promise<PaymentResult> {
  // Get booking info before confirming (for email)
  const bookings = await getPaymentStatus(bookingIds)
  
  const result = await confirmPayment(bookingIds)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')

    // Send confirmation email
    if (bookings.length > 0) {
      const booking = bookings[0]
      try {
        await sendPaymentConfirmationEmail({
          recipientEmail: booking.email,
          recipientName: booking.name,
          bookingDate: booking.date,
          bookingTime: bookings.map(b => b.time_slot).join(', '),
          amount: booking.payment_amount || 0,
        })
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError)
        // Don't fail the action if email fails
      }
    }
  }

  return result
}

/**
 * Reject payment (admin action)
 */
export async function rejectPaymentAction(bookingIds: string[], reason?: string): Promise<PaymentResult> {
  // Get booking info before rejecting (for email)
  const bookings = await getPaymentStatus(bookingIds)
  
  const result = await rejectPayment(bookingIds)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/profile')

    // Send rejection email
    if (bookings.length > 0) {
      const booking = bookings[0]
      try {
        await sendPaymentRejectionEmail({
          recipientEmail: booking.email,
          recipientName: booking.name,
          bookingDate: booking.date,
          bookingTime: bookings.map(b => b.time_slot).join(', '),
          amount: booking.payment_amount || 0,
          reason,
        })
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError)
        // Don't fail the action if email fails
      }
    }
  }

  return result
}

/**
 * Get pending payments for admin view
 */
export async function getPendingPaymentsAction(): Promise<PendingPaymentBooking[]> {
  return getPendingPayments()
}

/**
 * Get payment status for specific bookings
 */
export async function getPaymentStatusAction(bookingIds: string[]): Promise<Booking[]> {
  return getPaymentStatus(bookingIds)
}

/**
 * Get payment info for display on payment screen
 */
export async function getPaymentInfoAction(bookingId: string): Promise<PaymentInfo | null> {
  const [booking, settings] = await Promise.all([
    getBookingWithPayment(bookingId),
    getPaymentSettings(),
  ])

  if (!booking) {
    return null
  }

  return {
    amount: booking.payment_amount || 0,
    deadline: new Date(),
    qrCodeUrl: settings?.gcash_qr_url || null,
    gcashName: settings?.gcash_name || null,
    gcashNumber: settings?.gcash_number || null,
    bookingId: booking.id,
    status: booking.payment_status || 'pending',
  }
}
