'use server'

import { revalidatePath } from 'next/cache'
import {
  createBookingWithPendingPayment,
  confirmPayment,
  rejectPayment,
  getPendingPayments,
  getPaymentStatus,
  getPaymentStatusSummary,
} from '@/lib/paymentService'
import { isDateClosed } from '@/lib/bookingService'
import { Booking } from '@/types/booking'
import { PaymentResult, PendingPaymentBooking, PaymentStatusSummary } from '@/types/payment'
import { requireAdmin, getUserIdFromToken } from '@/lib/actionAuth'
import { sendPaymentConfirmationEmail, sendPaymentRejectionEmail, sendAdminPaymentAlertEmail } from '@/lib/emailService'
import { generateConfirmToken } from '@/lib/adminTokens'
import { verifyPriceQuote } from '@/lib/priceQuote'
import { getPricingVersionById } from '@/lib/pricingService'
import { quoteInputSchema } from '@/lib/pricingSchema'
import type { PriceQuote, PricingSnapshot } from '@/types/pricing'

const PRICES_CHANGED = 'Prices were updated. Please review the new total before paying.'
const QUOTE_EXPIRED = 'Your price quote expired. Please review the total before paying.'

/**
 * Submit payment - creates booking with pending status
 * Called when user clicks "I've Completed Payment".
 * Saves exactly the amount from the signed price quote the customer was shown;
 * an invalid or expired quote returns code 'quote_invalid' (never silently re-priced).
 */
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
  },
  quote: PriceQuote
): Promise<{ success: boolean; bookings?: Booking[]; error?: string; code?: 'quote_invalid' }> {
  const parsed = quoteInputSchema.safeParse({
    date: payload.date,
    timeSlots: payload.timeSlots,
    players: payload.players,
    paddles: payload.paddles ?? 0,
    needsBalls: payload.needsBalls ?? false,
    trainingBalls: payload.trainingBalls ?? false,
  })
  if (!parsed.success) {
    return { success: false, error: 'Invalid booking details.' }
  }

  // Check if date is closed
  const isClosed = await isDateClosed(payload.date)
  if (isClosed) {
    return { success: false, error: 'The court is closed on this date.' }
  }

  // Honour the price the customer was shown (signed quote), or ask them to review
  let snapshot: PricingSnapshot
  try {
    const check = verifyPriceQuote(quote, parsed.data)
    if (!check.ok) {
      return { success: false, code: 'quote_invalid', error: check.reason === 'expired' ? QUOTE_EXPIRED : PRICES_CHANGED }
    }
    const version = await getPricingVersionById(quote.versionId)
    if (!version) {
      return { success: false, code: 'quote_invalid', error: PRICES_CHANGED }
    }
    snapshot = { version_id: version.id, rules: version.rules }
  } catch (error) {
    console.error('Price quote check failed:', error)
    return { success: false, error: 'Prices are unavailable right now. Please try again in a moment.' }
  }

  // Link the booking to the signed-in user (verified), or book as a guest
  const userId = (await getUserIdFromToken(accessToken)) ?? undefined
  if (accessToken && !userId) {
    console.warn('submitPayment: access token rejected, booking as guest')
  }

  const result = await createBookingWithPendingPayment({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: parsed.data.date,
    timeSlots: parsed.data.timeSlots,
    court_number: payload.courtNumber,
    players: parsed.data.players,
    paddles: parsed.data.paddles,
    needs_balls: parsed.data.needsBalls,
    training_balls: parsed.data.trainingBalls,
    user_id: userId,
    gcash_reference: payload.gcashReference,
    payment_amount: quote.amount,
    pricing_snapshot: snapshot,
  })

  if (result.success && result.bookings && result.bookings.length > 0) {
    revalidatePath('/')
    revalidatePath('/admin')
    
    // Send admin notification email
    const booking = result.bookings[0]
    try {
      const groupId = booking.booking_group_id
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const confirmUrl = groupId
        ? `${appUrl}/api/admin/confirm-payment?groupId=${groupId}&token=${generateConfirmToken(groupId)}`
        : undefined

      const emailResult = await sendAdminPaymentAlertEmail({
        userName: payload.name,
        userEmail: payload.email,
        userPhone: payload.phone,
        bookingDate: payload.date,
        bookingTime: payload.timeSlots.join(', '),
        amount: booking.payment_amount || 0,
        shortId: booking.short_id || undefined,
        paddles: booking.paddles_count,
        needsBalls: booking.needs_balls,
        trainingBalls: booking.training_balls,
        reference: payload.gcashReference,
        confirmUrl,
      })
      if (!emailResult.success) {
        console.error('Admin alert email failed:', emailResult.error)
      }
    } catch (emailError) {
      console.error('Failed to send admin alert email:', emailError)
      // Don't fail the action if email fails
    }
  }

  return result
}

/**
 * Confirm payment (admin action)
 */
export async function confirmPaymentAction(accessToken: string, bookingIds: string[]): Promise<PaymentResult> {
  await requireAdmin(accessToken)
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
          shortId: booking.short_id || undefined,
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
export async function rejectPaymentAction(accessToken: string, bookingIds: string[], reason?: string): Promise<PaymentResult> {
  await requireAdmin(accessToken)
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
          shortId: booking.short_id || undefined,
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
export async function getPendingPaymentsAction(accessToken: string): Promise<PendingPaymentBooking[]> {
  await requireAdmin(accessToken)
  return getPendingPayments()
}

/**
 * Get payment status for specific bookings (public: status only, no personal data)
 */
export async function getPaymentStatusAction(bookingIds: string[]): Promise<PaymentStatusSummary[]> {
  return getPaymentStatusSummary(bookingIds)
}
