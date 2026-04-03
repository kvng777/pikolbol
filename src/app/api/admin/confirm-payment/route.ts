import { NextRequest, NextResponse } from 'next/server'
import { verifyConfirmToken } from '@/lib/adminTokens'
import { supabase } from '@/lib/supabase-server'
import { confirmPayment } from '@/lib/paymentService'
import { sendPaymentConfirmationEmail } from '@/lib/emailService'

function htmlPage(title: string, message: string, color: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box;">
  <div style="max-width: 420px; width: 100%; background: white; border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="width: 56px; height: 56px; border-radius: 50%; background-color: ${color}1a; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
      <span style="font-size: 28px;">${color === '#10b981' ? '✓' : color === '#f59e0b' ? 'ℹ' : '✕'}</span>
    </div>
    <h1 style="color: #111827; font-size: 20px; margin: 0 0 8px 0;">${title}</h1>
    <p style="color: #6b7280; font-size: 15px; margin: 0;">${message}</p>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('groupId')
  const token = searchParams.get('token')

  if (!groupId || !token) {
    return htmlPage('Invalid Link', 'This confirmation link is missing required parameters.', '#ef4444')
  }

  if (!verifyConfirmToken(groupId, token)) {
    return htmlPage('Invalid Link', 'This confirmation link is invalid or has been tampered with.', '#ef4444')
  }

  // Fetch all bookings in this group
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_group_id', groupId)
    .order('time_slot', { ascending: true })

  if (error || !bookings || bookings.length === 0) {
    return htmlPage('Not Found', 'No bookings found for this confirmation link.', '#ef4444')
  }

  // Check if already confirmed
  const allConfirmed = bookings.every(b => b.payment_status === 'confirmed')
  if (allConfirmed) {
    return htmlPage(
      'Already Confirmed',
      `This payment for ${bookings[0].name} (Booking ${bookings[0].short_id}) was already confirmed.`,
      '#f59e0b'
    )
  }

  // Confirm payment
  const pendingBookings = bookings.filter(b => b.payment_status === 'pending')
  const bookingIds = pendingBookings.map(b => b.id)
  const result = await confirmPayment(bookingIds)

  if (!result.success) {
    return htmlPage('Error', 'Failed to confirm payment. Please use the admin dashboard.', '#ef4444')
  }

  // Send confirmation email to customer
  const booking = bookings[0]
  try {
    await sendPaymentConfirmationEmail({
      recipientEmail: booking.email,
      recipientName: booking.name,
      bookingDate: booking.date,
      bookingTime: bookings.map((b: { time_slot: string }) => b.time_slot).join(', '),
      amount: booking.payment_amount || 0,
      shortId: booking.short_id || undefined,
    })
  } catch (emailError) {
    console.error('Failed to send confirmation email:', emailError)
  }

  return htmlPage(
    'Payment Confirmed!',
    `${booking.name}'s payment of Php ${(booking.payment_amount || 0).toLocaleString()} has been confirmed. A confirmation email has been sent to the customer.`,
    '#10b981'
  )
}
