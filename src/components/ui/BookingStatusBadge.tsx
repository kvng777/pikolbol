'use client'

import { PaymentStatus } from '@/types/payment'
import { getBookingStatusConfig } from '@/lib/bookingStatus'

interface BookingStatusBadgeProps {
  paymentStatus: PaymentStatus | null | undefined
  bookingDate: string
  size?: 'sm' | 'md'
}

/**
 * Display badge for booking status
 * Automatically handles "completed" status for past confirmed bookings
 */
export function BookingStatusBadge({ 
  paymentStatus, 
  bookingDate, 
  size = 'sm' 
}: BookingStatusBadgeProps) {
  const config = getBookingStatusConfig(paymentStatus, bookingDate)
  
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : 'px-2.5 py-1 text-sm'
  
  return (
    <span 
      className={`inline-flex items-center rounded-full font-medium border ${config.className} ${sizeClasses}`}
      title={config.description}
    >
      {config.shortLabel}
    </span>
  )
}
