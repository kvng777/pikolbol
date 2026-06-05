import { NextRequest, NextResponse } from 'next/server'
import { verifyConfirmToken } from '@/lib/adminTokens'
import { approveRescheduleRequest, rejectRescheduleRequest } from '@/lib/bookingService'

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
  const requestId = searchParams.get('requestId')
  const action = searchParams.get('action')
  const token = searchParams.get('token')

  if (!requestId || !action || !token) {
    return htmlPage('Invalid Link', 'This link is missing required parameters.', '#ef4444')
  }

  if (action !== 'approve' && action !== 'reject') {
    return htmlPage('Invalid Link', 'Unknown action type.', '#ef4444')
  }

  if (!verifyConfirmToken(requestId, token)) {
    return htmlPage('Invalid Link', 'This link is invalid or has been tampered with.', '#ef4444')
  }

  if (action === 'approve') {
    const result = await approveRescheduleRequest(requestId)
    if (!result.success) {
      const isAlreadyProcessed = result.error?.includes('already been')
      return htmlPage(
        isAlreadyProcessed ? 'Already Processed' : 'Error',
        result.error || 'Failed to approve reschedule.',
        isAlreadyProcessed ? '#f59e0b' : '#ef4444'
      )
    }
    return htmlPage(
      'Reschedule Approved!',
      'The booking has been moved to the new schedule. The customer has been notified.',
      '#10b981'
    )
  } else {
    const result = await rejectRescheduleRequest(requestId)
    if (!result.success) {
      const isAlreadyProcessed = result.error?.includes('already been')
      return htmlPage(
        isAlreadyProcessed ? 'Already Processed' : 'Error',
        result.error || 'Failed to reject reschedule.',
        isAlreadyProcessed ? '#f59e0b' : '#ef4444'
      )
    }
    return htmlPage(
      'Reschedule Rejected',
      'The original booking remains unchanged. The customer has been notified.',
      '#ef4444'
    )
  }
}
