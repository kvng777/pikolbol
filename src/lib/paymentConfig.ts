/**
 * Payment Configuration
 * Centralized constants for payment-related settings
 */

// Pricing
export const PRICE_PER_SLOT = 200 // PHP per 1-hour slot
export const EXTRA_PLAYER_CHARGE = 50 // PHP per player beyond 4
export const BASE_PLAYERS_INCLUDED = 4 // Players included in base price

// Default timeout (can be overridden by admin settings)
export const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 15

// Payment statuses that indicate a slot is "held" (unavailable)
export const HELD_PAYMENT_STATUSES = ['pending', 'awaiting_confirmation'] as const

// Payment statuses that indicate booking is finalized
export const CONFIRMED_PAYMENT_STATUSES = ['confirmed'] as const

// Payment statuses that indicate booking should be released
export const RELEASED_PAYMENT_STATUSES = ['expired', 'rejected'] as const

/**
 * Calculate the total payment amount for a booking
 */
export function calculatePaymentAmount(slotsCount: number, playersCount: number): number {
  const baseAmount = PRICE_PER_SLOT * slotsCount
  const extraPlayers = Math.max(0, playersCount - BASE_PLAYERS_INCLUDED)
  const extraCharge = extraPlayers * EXTRA_PLAYER_CHARGE
  
  return baseAmount + extraCharge
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
