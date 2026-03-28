/**
 * Booking Status Utilities
 * Centralized logic for booking status display and filtering
 */

import { PaymentStatus } from '@/types/payment'

// Booking status for display (combines payment status with time-based status)
export type BookingDisplayStatus = 
  | 'pending'           // User paid, waiting for admin verification
  | 'confirmed'         // Payment verified, booking confirmed
  | 'rejected'          // Admin rejected payment
  | 'cancelled'         // User cancelled
  | 'completed'         // Past booking (was confirmed)

export interface BookingStatusConfig {
  label: string
  shortLabel: string
  className: string
  bgColor: string
  textColor: string
  description: string
}

/**
 * Status configuration for UI display
 */
export const BOOKING_STATUS_CONFIG: Record<PaymentStatus | 'completed', BookingStatusConfig> = {
  pending: {
    label: 'Pending Verification',
    shortLabel: 'Pending',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    description: 'Payment submitted, awaiting admin verification',
  },
  confirmed: {
    label: 'Confirmed',
    shortLabel: 'Confirmed',
    className: 'bg-green-100 text-green-700 border-green-200',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    description: 'Payment verified, booking confirmed',
  },
  rejected: {
    label: 'Rejected',
    shortLabel: 'Rejected',
    className: 'bg-red-100 text-red-700 border-red-200',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    description: 'Payment rejected by admin',
  },
  cancelled: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    className: 'bg-gray-100 text-gray-500 border-gray-200',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
    description: 'Cancelled by user',
  },
  completed: {
    label: 'Completed',
    shortLabel: 'Completed',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    description: 'Past booking that was completed',
  },
}

/**
 * Filter options for admin booking list
 */
export const BOOKING_FILTER_OPTIONS = [
  { value: 'all', label: 'All Bookings' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending Verification' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export type BookingFilterValue = typeof BOOKING_FILTER_OPTIONS[number]['value']

/**
 * Time-based filter options
 */
export const TIME_FILTER_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'past', label: 'Past' },
] as const

export type TimeFilterValue = typeof TIME_FILTER_OPTIONS[number]['value']

/**
 * Determine if a booking date is in the past
 */
export function isBookingPast(bookingDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const booking = new Date(bookingDate + 'T00:00:00')
  return booking < today
}

/**
 * Determine if a booking date is today
 */
export function isBookingToday(bookingDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const booking = new Date(bookingDate + 'T00:00:00')
  return booking.getTime() === today.getTime()
}

/**
 * Get display status considering both payment status and time
 */
export function getDisplayStatus(
  paymentStatus: PaymentStatus | null | undefined,
  bookingDate: string
): PaymentStatus | 'completed' {
  // If confirmed and in the past, show as "completed"
  if (paymentStatus === 'confirmed' && isBookingPast(bookingDate)) {
    return 'completed'
  }
  
  return paymentStatus || 'pending'
}

/**
 * Get status config for a booking
 */
export function getBookingStatusConfig(
  paymentStatus: PaymentStatus | null | undefined,
  bookingDate: string
): BookingStatusConfig {
  const displayStatus = getDisplayStatus(paymentStatus, bookingDate)
  return BOOKING_STATUS_CONFIG[displayStatus]
}
