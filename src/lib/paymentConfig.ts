/**
 * Payment settings and helpers. Prices are NOT here: they live in the
 * pricing_schedules table (see lib/pricing.ts).
 */

// Finance "time of day" reporting bands (labels only; prices come from the pricing schedule)
export const EVENING_START_HOUR = 18           // 6:00 PM
export const LATE_NIGHT_START_HOUR = 22        // 10:00 PM

export const MAX_PADDLES = 8               // UI cap for paddle quantity selector

// Default timeout (can be overridden by admin settings)
export const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 15

// Payment statuses that indicate a slot is "held" (unavailable)
export const HELD_PAYMENT_STATUSES = ['pending'] as const

// Payment statuses that indicate booking is finalized
export const CONFIRMED_PAYMENT_STATUSES = ['confirmed'] as const

// Payment statuses that indicate booking should be released
export const RELEASED_PAYMENT_STATUSES = ['rejected', 'cancelled'] as const

// Payment statuses shown in admin "Pending Payments" tab
export const PENDING_VERIFICATION_STATUSES = ['pending'] as const

/**
 * Extract the start hour from a time slot string
 * Handles formats like "18:00", "6:00 PM", "18:00 - 19:00", "6:00 PM - 7:00 PM"
 */
export function getSlotStartHour(timeSlot: string): number {
  // Get the start time (before any dash separator)
  const startTime = timeSlot.split('-')[0].trim()
  
  // Try to parse 24-hour format first (e.g., "18:00")
  const match24h = startTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24h) {
    return parseInt(match24h[1], 10)
  }
  
  // Try to parse 12-hour format (e.g., "6:00 PM")
  const match12h = startTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match12h) {
    let hour = parseInt(match12h[1], 10)
    const period = match12h[3].toUpperCase()
    
    if (period === 'PM' && hour !== 12) {
      hour += 12
    } else if (period === 'AM' && hour === 12) {
      hour = 0
    }
    
    return hour
  }
  
  // Fallback: try to extract any leading number
  const fallbackMatch = startTime.match(/^(\d{1,2})/)
  if (fallbackMatch) {
    return parseInt(fallbackMatch[1], 10)
  }
  
  // Default to daytime if parsing fails
  return 12
}

/**
 * Format the selected equipment into a human-readable summary.
 * Returns null when no equipment was selected.
 * e.g. "2 paddles, balls (set of 4)", "1 paddle", "Balls (set of 4)"
 */
export function formatEquipmentSummary(
  paddles?: number | null,
  needsBalls?: boolean | null,
  trainingBalls?: boolean | null
): string | null {
  const items: string[] = []
  const paddleCount = paddles ?? 0

  if (paddleCount > 0) {
    items.push(`${paddleCount} paddle${paddleCount > 1 ? 's' : ''}`)
  }
  if (needsBalls) {
    items.push(items.length === 0 ? 'Balls (set of 4)' : 'balls (set of 4)')
  }
  if (trainingBalls) {
    items.push(items.length === 0 ? 'Training balls (50)' : 'training balls (50)')
  }

  return items.length > 0 ? items.join(', ') : null
}

/**
 * Calculate payment deadline from creation time
 */
export function calculatePaymentDeadline(
  createdAt: Date, 
  timeoutMinutes: number = DEFAULT_PAYMENT_TIMEOUT_MINUTES
): Date {
  return new Date(createdAt.getTime() + timeoutMinutes * 60 * 1000)
}

/**
 * Check if a payment deadline has passed
 */
export function isPaymentExpired(deadline: Date | string): boolean {
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline
  return new Date() > deadlineDate
}

/**
 * Get remaining time until deadline in seconds
 */
export function getRemainingSeconds(deadline: Date | string): number {
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline
  const remaining = deadlineDate.getTime() - Date.now()
  return Math.max(0, Math.floor(remaining / 1000))
}

/**
 * Format remaining time as MM:SS
 */
export function formatRemainingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
