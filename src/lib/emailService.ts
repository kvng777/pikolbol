// Email configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'bookings@pikolbol.fun'
const APP_NAME = 'Pikolbol'

interface EmailOptions {
  to: string
  subject: string
  html: string
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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${APP_NAME} <${EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
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
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
        <div style="background: linear-gradient(to right, #10b981, #14b8a6); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Payment Confirmed!</h1>
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
              <p style="color: #166534; font-size: 20px; margin: 4px 0 0 0; font-weight: 600;">Php ${data.amount.toLocaleString()}</p>
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
    subject: `Booking Confirmed - ${formattedDate}`,
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
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
        <div style="background-color: #fef2f2; padding: 24px; text-align: center; border-bottom: 1px solid #fecaca;">
          <h1 style="color: #dc2626; margin: 0; font-size: 24px;">Payment Not Verified</h1>
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
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">Php ${data.amount.toLocaleString()}</p>
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
    subject: `Payment Not Verified - ${formattedDate}`,
    html,
  })
}

/**
 * Send payment expired email (optional - called by expiration job)
 */
export async function sendPaymentExpiredEmail(data: {
  recipientEmail: string
  recipientName: string
  bookingDate: string
  bookingTime: string
  amount: number
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

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
        <div style="background-color: #fefce8; padding: 24px; text-align: center; border-bottom: 1px solid #fef08a;">
          <h1 style="color: #a16207; margin: 0; font-size: 24px;">Booking Expired</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Hi ${data.recipientName},
          </p>
          
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">
            Your booking has expired because payment was not completed within the required time. The time slot has been released and is now available for others to book.
          </p>
          
          <!-- Booking Details Card -->
          <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #a16207; margin: 0 0 16px 0; font-size: 16px;">Expired Booking</h3>
            
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
              <p style="color: #111827; font-size: 16px; margin: 4px 0 0 0; font-weight: 500;">Php ${data.amount.toLocaleString()}</p>
            </div>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
            If you'd still like to book, please visit our website and try again. We apologize for any inconvenience.
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
    subject: `Booking Expired - ${formattedDate}`,
    html,
  })
}
