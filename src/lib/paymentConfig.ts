/**
 * Payment Configuration
 * Centralized constants for payment-related settings
 */

// Pricing
export const DAYTIME_PRICE_PER_SLOT = 200  // PHP per 1-hour slot (7:00 AM - 5:59 PM)
export const EVENING_PRICE_PER_SLOT = 250  // PHP per 1-hour slot (6:00 PM onwards)
export const EVENING_START_HOUR = 18       // 6:00 PM (18:00) - slots starting at this hour or later are evening rate
export const EXTRA_PLAYER_CHARGE = 50      // PHP per player beyond 4
export const BASE_PLAYERS_INCLUDED = 4     // Players included in base price

// Legacy constant for backwards compatibility (use getPriceForSlot instead)
export const PRICE_PER_SLOT = 200

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
 * Check if a time slot is during evening hours (6:00 PM onwards)
 */
export function isEveningSlot(timeSlot: string): boolean {
  const hour = getSlotStartHour(timeSlot)
  return hour >= EVENING_START_HOUR
}

/**
 * Get the price for a single time slot
 */
export function getPriceForSlot(timeSlot: string): number {
  return isEveningSlot(timeSlot) ? EVENING_PRICE_PER_SLOT : DAYTIME_PRICE_PER_SLOT
}

/**
 * Calculate the total payment amount for a booking with multiple time slots
 * Each slot is priced based on its time (daytime vs evening)
 */
export function calculatePaymentAmount(timeSlots: string[], playersCount: number): number {
  // Calculate base amount from all slots
  const baseAmount = timeSlots.reduce((total, slot) => total + getPriceForSlot(slot), 0)
  
  // Calculate extra player charge
  const extraPlayers = Math.max(0, playersCount - BASE_PLAYERS_INCLUDED)
  const extraCharge = extraPlayers * EXTRA_PLAYER_CHARGE
  
  return baseAmount + extraCharge
}

/**
 * Calculate payment amount from slot count only (legacy, uses daytime rate)
 * @deprecated Use calculatePaymentAmount with time slots array instead
 */
export function calculatePaymentAmountLegacy(slotsCount: number, playersCount: number): number {
  const baseAmount = DAYTIME_PRICE_PER_SLOT * slotsCount
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
