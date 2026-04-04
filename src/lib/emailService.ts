// Email configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'bookings@pikolbol.fun'
const APP_NAME = 'Pikolbol'

// Admin contact for alerts when a user indicates they've completed payment
const ADMIN_EMAIL = 'gamboa_rolando61@yahoo.com'
const ADMIN_CC = 'kjangamboa@hotmail.com'

// Small helpers to keep templates DRY
function formatBookingDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatAmount(amount: number) {
  return amount.toLocaleString()
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  cc?: string | string[]
}

/**
 * Send an email using Resend API
 */
async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured. Email not sent.')
    return { success: true } // Don't fail if email not configured
  }

  try {
    const payload: Record<string, unknown> = {
      from: `${APP_NAME} <${EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    }

    if (options.cc) {
      payload.cc = options.cc
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Resend API error:', errorData)
      return { success: false, error: errorData.message || 'Failed to send email' }
    }

    return { success: true }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmationEmail(data: {
  recipientEmail: string
  recipientName: string
  bookingDate: string
  bookingTime: string
  amount: number
  shortId?: string  // Human-readable booking ID (e.g., 'A1B2')
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = formatBookingDate(data.bookingDate)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background-color: #10b981; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Confirmed!</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Hi ${data.recipientName},
          </p>
          
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Great news! Your payment has been confirmed and your court booking is now secured.
          </p>
          
          <!-- Booking Details Card -->
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #166534; margin: 0 0 16px 0; font-size: 16px;">Booking Details</h3>
            
            ${data.shortId ? `
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Booking ID:</span>
              <p style="color: #166534; font-size: 18px; margin: 4px 0 0 0; font-weight: 600; font-family: monospace;">${data.shortId}</p>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Date:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${formattedDate}</p>
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Time:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.bookingTime}</p>
            </div>
            
            <div>
              <span style="color: #6b7280; font-size: 14px;">Amount Paid:</span>
              <p style="color: #166534; font-size: 20px; margin: 4px 0 0 0; font-weight: 600;">Php ${formatAmount(data.amount)}</p>
            </div>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
            See you at the court! If you have any questions, feel free to contact us.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            ${APP_NAME} - Your Pickleball Booking Platform
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return sendEmail({
    to: data.recipientEmail,
    subject: `Booking Confirmed${data.shortId ? ` - ${data.shortId}` : ''} - ${formattedDate}`,
    html,
  })
}

/**
 * Send payment rejection email
 */
export async function sendPaymentRejectionEmail(data: {
  recipientEmail: string
  recipientName: string
  bookingDate: string
  bookingTime: string
  amount: number
  reason?: string
  shortId?: string  // Human-readable booking ID (e.g., 'A1B2')
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = formatBookingDate(data.bookingDate)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background-color: #dc2626; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Not Verified</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Hi ${data.recipientName},
          </p>
          
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Unfortunately, we were unable to verify your payment for the following booking. The time slot has been released and is available for others to book.
          </p>
          
          <!-- Booking Details Card -->
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #991b1b; margin: 0 0 16px 0; font-size: 16px;">Booking Details</h3>
            
            ${data.shortId ? `
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Booking ID:</span>
              <p style="color: #991b1b; font-size: 18px; margin: 4px 0 0 0; font-weight: 600; font-family: monospace;">${data.shortId}</p>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Date:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${formattedDate}</p>
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Time:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.bookingTime}</p>
            </div>
            
            <div>
              <span style="color: #6b7280; font-size: 14px;">Amount:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">Php ${formatAmount(data.amount)}</p>
            </div>

            ${data.reason ? `
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #fecaca;">
              <span style="color: #6b7280; font-size: 14px;">Reason:</span>
              <p style="color: #991b1b; font-size: 14px; margin: 4px 0 0 0;">${data.reason}</p>
            </div>
            ` : ''}
          </div>
          
          <p style="color: #374151; font-size: 14px; margin-bottom: 16px;">
            If you believe this is an error, please contact us with your GCash reference number so we can investigate.
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
            You're welcome to try booking again. We apologize for any inconvenience.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            ${APP_NAME} - Your Pickleball Booking Platform
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return sendEmail({
    to: data.recipientEmail,
    subject: `Payment Not Verified${data.shortId ? ` - ${data.shortId}` : ''} - ${formattedDate}`,
    html,
  })
}

/**
 * Send admin alert when user indicates they've completed payment
 * Uses urgent orange/amber styling to grab attention
 */
export async function sendAdminPaymentAlertEmail(data: {
  userName: string
  userEmail: string
  userPhone?: string
  bookingDate: string
  bookingTime: string
  amount: number
  reference?: string
  shortId?: string  // Human-readable booking ID (e.g., 'A1B2')
  confirmUrl?: string  // Signed URL to confirm payment directly from email
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = formatBookingDate(data.bookingDate)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header - Urgent Orange -->
        <div style="background-color: #ea580c; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ACTION REQUIRED</h1>
          <p style="color: #fed7aa; margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">New payment awaiting verification</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <!-- Urgent Alert Banner -->
          <div style="background-color: #fff7ed; border: 2px solid #fdba74; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
            <p style="color: #c2410c; font-size: 14px; font-weight: 600; margin: 0;">
              A user has submitted payment and is waiting for your confirmation.
            </p>
          </div>
          
          <!-- Customer Info -->
          <div style="margin-bottom: 20px;">
            <h3 style="color: #9a3412; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Customer</h3>
            <p style="color: #111827; font-size: 16px; margin: 0; font-weight: 600;">${data.userName}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">${data.userEmail}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">${data.userPhone}</p>
          </div>
          
          <!-- Booking Details Card -->
          <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #9a3412; margin: 0 0 16px 0; font-size: 16px;">Booking Details</h3>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Date:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${formattedDate}</p>
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Time:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.bookingTime}</p>
            </div>
            
            ${data.shortId ? `
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Booking ID:</span>
              <p style="color: #111827; font-size: 18px; margin: 4px 0 0 0; font-weight: 600; font-family: monospace;">${data.shortId}</p>
            </div>
            ` : ''}

            <div style="margin-bottom: ${data.reference ? '12px' : '0'};">
              <span style="color: #6b7280; font-size: 14px;">Amount to Verify:</span>
              <p style="color: #c2410c; font-size: 20px; margin: 4px 0 0 0; font-weight: 700;">Php ${formatAmount(data.amount)}</p>
            </div>

            ${data.reference ? `
            <div style="padding-top: 12px; border-top: 1px solid #fed7aa;">
              <span style="color: #6b7280; font-size: 14px;">Reference Number:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.reference}</p>
            </div>
            ` : ''}
          </div>
          
          <!-- Call to Action -->
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">
              Please verify this payment promptly
            </p>
            <p style="color: #6b7280; font-size: 13px; margin: 0;">
              Check your GCash for the incoming payment, then confirm below or reject in the admin panel.
            </p>
          </div>

          ${data.confirmUrl ? `
          <!-- Confirm Button -->
          <div style="margin-top: 20px; text-align: center;">
            <a href="${data.confirmUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: 0.3px;">
              ✓ Confirm Payment
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
              Clicking will confirm the payment and notify the customer.
            </p>
          </div>
          ` : ''}
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            ${APP_NAME} - Admin Alert
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return sendEmail({
    to: ADMIN_EMAIL,
    cc: ADMIN_CC,
    subject: `[ACTION REQUIRED] Payment Verification - ${data.userName} - Php ${formatAmount(data.amount)}`,
    html,
  })
}

/**
 * Send admin alert when user cancels a booking that requires refund
 * Uses blue styling for refund-related alerts
 */
export async function sendAdminRefundAlertEmail(data: {
  userName: string
  userEmail: string
  userPhone: string
  bookingDate: string
  bookingTime: string
  originalAmount: number
  cancellationFee: number
  refundAmount: number
  shortId?: string
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = formatBookingDate(data.bookingDate)
  const displayShortId = data.shortId || 'N/A'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header - Blue for Refunds -->
        <div style="background-color: #2563eb; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">REFUND REQUIRED</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">A customer has cancelled their booking</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <!-- Urgent Alert Banner -->
          <div style="background-color: #fff7ed; border: 2px solid #fdba74; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
            <p style="color: #c2410c; font-size: 14px; font-weight: 600; margin: 0;">
              Process this refund via GCash and mark as completed in the admin panel.
            </p>
          </div>
          
          <!-- Customer Info -->
          <div style="margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Customer</h3>
            <p style="color: #111827; font-size: 16px; margin: 0; font-weight: 600;">${data.userName}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">${data.userEmail}</p>
            <div style="margin-top: 8px; padding: 8px 12px; background-color: #dbeafe; border-radius: 6px; display: inline-block;">
              <span style="color: #1e40af; font-size: 14px; font-weight: 600;">📱 ${data.userPhone}</span>
              <span style="color: #3b82f6; font-size: 12px; margin-left: 8px;">(for GCash refund)</span>
            </div>
          </div>
          
          <!-- Booking Details Card -->
          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin: 0 0 16px 0; font-size: 16px;">Booking Details</h3>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Booking ID:</span>
              <p style="color: #111827; font-size: 18px; margin: 4px 0 0 0; font-weight: 600; font-family: monospace;">${displayShortId}</p>
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Date:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${formattedDate}</p>
            </div>
            
            <div style="margin-bottom: 16px;">
              <span style="color: #6b7280; font-size: 14px;">Time:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.bookingTime}</p>
            </div>

            <!-- Payment Breakdown -->
            <div style="border-top: 1px solid #bfdbfe; padding-top: 16px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #6b7280; font-size: 14px;">Original Payment:</span>
                <span style="color: #111827; font-size: 14px; font-weight: 500;">P${formatAmount(data.originalAmount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #6b7280; font-size: 14px;">Cancellation Fee:</span>
                <span style="color: ${data.cancellationFee > 0 ? '#dc2626' : '#059669'}; font-size: 14px; font-weight: 500;">${data.cancellationFee > 0 ? '-' : ''}P${formatAmount(data.cancellationFee)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid #2563eb;">
                <span style="color: #1e40af; font-size: 16px; font-weight: 700;">REFUND TO SEND:</span>
                <span style="color: #2563eb; font-size: 20px; font-weight: 700;">P${formatAmount(data.refundAmount)}</span>
              </div>
            </div>
          </div>
          
          <!-- Call to Action -->
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">
              Next Steps
            </p>
            <p style="color: #6b7280; font-size: 13px; margin: 0;">
              1. Send P${formatAmount(data.refundAmount)} to the customer's GCash (${data.userPhone})<br>
              2. Mark the refund as completed in the admin panel
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            ${APP_NAME} - Admin Alert
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return sendEmail({
    to: ADMIN_EMAIL,
    cc: ADMIN_CC,
    subject: `[REFUND REQUIRED] Booking Cancelled - ${displayShortId} - ${data.userName} - P${formatAmount(data.refundAmount)}`,
    html,
  })
}

/**
 * Send user notification when their refund has been processed
 * Uses green styling for successful refund confirmation
 */
export async function sendUserRefundCompletedEmail(data: {
  recipientEmail: string
  recipientName: string
  bookingDate: string
  bookingTime: string
  originalAmount: number
  cancellationFee: number
  refundAmount: number
  shortId?: string
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = formatBookingDate(data.bookingDate)

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header - Green for Success -->
        <div style="background-color: #10b981; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Refund Processed!</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Hi ${data.recipientName},
          </p>
          
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Great news! Your refund has been processed and sent to your GCash account.
          </p>
          
          <!-- Refund Details Card -->
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #166534; margin: 0 0 16px 0; font-size: 16px;">Refund Details</h3>
            
            ${data.shortId ? `
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Booking ID:</span>
              <p style="color: #166534; font-size: 18px; margin: 4px 0 0 0; font-weight: 600; font-family: monospace;">${data.shortId}</p>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">Original Booking Date:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${formattedDate}</p>
            </div>
            
            <div style="margin-bottom: 16px;">
              <span style="color: #6b7280; font-size: 14px;">Original Time Slots:</span>
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">${data.bookingTime}</p>
            </div>

            <!-- Payment Breakdown -->
            <div style="border-top: 1px solid #bbf7d0; padding-top: 16px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #6b7280; font-size: 14px;">Original Payment:</span>
                <span style="color: #111827; font-size: 14px; font-weight: 500;">P${formatAmount(data.originalAmount)}</span>
              </div>
              ${data.cancellationFee > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="color: #6b7280; font-size: 14px;">Cancellation Fee:</span>
                <span style="color: #dc2626; font-size: 14px; font-weight: 500;">-P${formatAmount(data.cancellationFee)}</span>
              </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid #10b981;">
                <span style="color: #166534; font-size: 16px; font-weight: 700;">REFUND SENT:</span>
                <span style="color: #10b981; font-size: 20px; font-weight: 700;">P${formatAmount(data.refundAmount)}</span>
              </div>
            </div>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
            The refund should appear in your GCash account shortly. If you don't see it within 24 hours, please contact us.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            ${APP_NAME} - Your Pickleball Booking Platform
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return sendEmail({
    to: data.recipientEmail,
    subject: `Your Refund Has Been Processed - P${formatAmount(data.refundAmount)}`,
    html,
  })
}
