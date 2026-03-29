'use client'

import { useState } from 'react'
import { format, parseISO, isAfter, addHours } from 'date-fns'
import { Booking } from '@/types/booking'
import { PaymentStatus } from '@/types/payment'
import { Calendar, Clock, X, AlertTriangle, Loader2, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CANCELLATION_HOURS_BEFORE } from '@/lib/constants'

// Payment status badge configuration
const paymentStatusConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending Verification',
    className: 'bg-orange-100 text-orange-700',
  },
  confirmed: {
    label: 'Paid',
    className: 'bg-green-100 text-green-700',
  },
  rejected: {
    label: 'Payment Rejected',
    className: 'bg-red-100 text-red-700',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-500',
  },
}

interface BookingHistoryProps {
  bookings: Booking[]
  isLoading: boolean
  onCancelBooking: (bookingId: string) => Promise<void>
  isCancelling: boolean
}

type BookingStatus = 'upcoming' | 'past' | 'today'

function getBookingStatus(booking: Booking): BookingStatus {
  const now = new Date()
  const bookingDate = parseISO(booking.date)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const bookingDay = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate())

  if (bookingDay.getTime() === today.getTime()) {
    return 'today'
  } else if (isAfter(bookingDate, today)) {
    return 'upcoming'
  }
  return 'past'
}

function canCancelBooking(booking: Booking): { canCancel: boolean; reason?: string } {
  // Cannot cancel if payment is not confirmed (for bookings with payment)
  if (booking.payment_status && booking.payment_status !== 'confirmed') {
    if (booking.payment_status === 'pending') {
      return { canCancel: false, reason: 'Wait for payment verification' }
    }
    if (booking.payment_status === 'rejected' || booking.payment_status === 'cancelled') {
      return { canCancel: false, reason: 'Booking already cancelled' }
    }
  }

  const now = new Date()
  
  // Parse the booking date and time
  const bookingDate = parseISO(booking.date)
  
  // Extract start time from time_slot (e.g., "6:00 AM - 7:00 AM" -> "6:00 AM")
  const startTime = booking.time_slot.split(' - ')[0].trim()
  const timeMatch = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  
  if (!timeMatch) {
    return { canCancel: false }
  }

  let hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const period = timeMatch[3].toUpperCase()

  if (period === 'PM' && hours !== 12) {
    hours += 12
  } else if (period === 'AM' && hours === 12) {
    hours = 0
  }

  const bookingDateTime = new Date(bookingDate)
  bookingDateTime.setHours(hours, minutes, 0, 0)

  // Check if booking is more than CANCELLATION_HOURS_BEFORE hours away
  const cancellationDeadline = addHours(now, CANCELLATION_HOURS_BEFORE)
  const withinDeadline = isAfter(bookingDateTime, cancellationDeadline)
  
  if (!withinDeadline) {
    return { canCancel: false, reason: `Cannot cancel within ${CANCELLATION_HOURS_BEFORE}h` }
  }
  
  return { canCancel: true }
}

interface CancelConfirmModalProps {
  booking: Booking
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function CancelConfirmModal({ booking, onConfirm, onCancel, isLoading }: CancelConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Cancel Booking?</h3>
        </div>
        
        <p className="text-gray-600 mb-4">
          Are you sure you want to cancel your booking for:
        </p>
        
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="font-medium text-gray-900">
            {format(parseISO(booking.date), 'EEEE, MMMM d, yyyy')}
          </p>
          <p className="text-gray-600">{booking.time_slot}</p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            Keep Booking
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cancelling...
              </span>
            ) : (
              'Yes, Cancel'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function BookingHistory({ bookings, isLoading, onCancelBooking, isCancelling }: BookingHistoryProps) {
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">No bookings yet</h3>
        <p className="text-gray-500">Your booking history will appear here.</p>
      </div>
    )
  }

  // Sort bookings: upcoming first (by date asc), then past (by date desc)
  const sortedBookings = [...bookings].sort((a, b) => {
    const statusA = getBookingStatus(a)
    const statusB = getBookingStatus(b)
    
    // Upcoming and today come before past
    const statusOrder = { upcoming: 0, today: 1, past: 2 }
    if (statusOrder[statusA] !== statusOrder[statusB]) {
      return statusOrder[statusA] - statusOrder[statusB]
    }
    
    // Within same status, sort by date
    if (statusA === 'past') {
      // Past bookings: most recent first
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    }
    // Upcoming/today: earliest first
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })

  const handleCancelClick = (bookingId: string) => {
    setCancellingBookingId(bookingId)
  }

  const handleConfirmCancel = async () => {
    if (!cancellingBookingId) return
    await onCancelBooking(cancellingBookingId)
    setCancellingBookingId(null)
  }

  const bookingToCancel = bookings.find(b => b.id === cancellingBookingId)

  return (
    <div className="space-y-4">
      {cancellingBookingId && bookingToCancel && (
        <CancelConfirmModal
          booking={bookingToCancel}
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancellingBookingId(null)}
          isLoading={isCancelling}
        />
      )}

      {sortedBookings.map((booking) => {
        const status = getBookingStatus(booking)
        const cancelCheck = canCancelBooking(booking)

        return (
          <div
            key={booking.id}
            className={`rounded-xl border p-4 transition-all ${
              status === 'past'
                ? 'bg-gray-50 border-gray-200 opacity-75'
                : status === 'today'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {/* Status badges */}
                <div className="mb-2 flex flex-wrap gap-2">
                  {/* Time status badge */}
                  {status === 'today' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      Today
                    </span>
                  )}
                  {status === 'upcoming' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      Upcoming
                    </span>
                  )}
                  {status === 'past' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      Completed
                    </span>
                  )}

                  {/* Payment status badge */}
                  {booking.payment_status && (
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${paymentStatusConfig[booking.payment_status].className}`}>
                      <CreditCard className="w-3 h-3" />
                      {paymentStatusConfig[booking.payment_status].label}
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-2 text-gray-900 font-medium">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {format(parseISO(booking.date), 'EEEE, MMMM d, yyyy')}
                </div>

                {/* Time */}
                <div className="flex items-center gap-2 text-gray-600 mt-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {booking.time_slot}
                </div>

                {/* Payment amount */}
                {booking.payment_amount && booking.payment_status === 'confirmed' && (
                  <p className="text-sm text-green-600 font-medium mt-1">
                    ₱{booking.payment_amount.toFixed(2)} paid
                  </p>
                )}
              </div>

              {/* Cancel button (only for upcoming bookings that can be cancelled) */}
              {status !== 'past' && (
                <div className="ml-4">
                  {cancelCheck.canCancel ? (
                    <button
                      onClick={() => handleCancelClick(booking.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Cancel booking"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  ) : cancelCheck.reason ? (
                    <div className="text-xs text-gray-400 text-right max-w-[120px]">
                      {cancelCheck.reason}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
