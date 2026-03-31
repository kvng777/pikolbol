'use client'

import { useState, useMemo } from 'react'
import { format, parseISO, isAfter, addHours } from 'date-fns'
import { Booking } from '@/types/booking'
import { PaymentStatus } from '@/types/payment'
import { Calendar, Clock, AlertTriangle, Loader2, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CANCELLATION_HOURS_BEFORE, CANCELLATION_FEE_PER_SLOT } from '@/lib/constants'

// ============================================================================
// Types
// ============================================================================

type BookingStatus = 'upcoming' | 'past' | 'today'

interface BookingGroup {
  groupKey: string
  bookingGroupId: string | null
  shortId: string | null
  bookings: Booking[]
  date: string
  timeSlots: string[]
  totalAmount: number | null
  paymentStatus: PaymentStatus | undefined
  status: BookingStatus
  // Cancellation info
  hoursUntilBooking: number
  cancellationFee: number
  refundAmount: number
}

// ============================================================================
// Config
// ============================================================================

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

// ============================================================================
// Helper Functions
// ============================================================================

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

function parseBookingDateTime(date: string, timeSlot: string): Date {
  const startTime = timeSlot.split(' - ')[0].trim()
  const timeMatch = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  
  if (!timeMatch) {
    return new Date(date)
  }

  let hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const period = timeMatch[3].toUpperCase()

  if (period === 'PM' && hours !== 12) {
    hours += 12
  } else if (period === 'AM' && hours === 12) {
    hours = 0
  }

  const bookingDate = new Date(date)
  bookingDate.setHours(hours, minutes, 0, 0)
  
  return bookingDate
}

function calculateHoursUntilBooking(bookings: Booking[]): number {
  if (bookings.length === 0) return 0
  
  // Find the earliest time slot
  const sortedBookings = [...bookings].sort((a, b) => 
    a.time_slot.localeCompare(b.time_slot)
  )
  const earliest = sortedBookings[0]
  
  const bookingDateTime = parseBookingDateTime(earliest.date, earliest.time_slot)
  const now = new Date()
  return (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
}

function calculateCancellationFee(
  totalAmount: number,
  numberOfSlots: number,
  hoursUntilBooking: number
): { cancellationFee: number; refundAmount: number } {
  if (hoursUntilBooking > CANCELLATION_HOURS_BEFORE) {
    return { cancellationFee: 0, refundAmount: totalAmount }
  } else {
    const fee = numberOfSlots * CANCELLATION_FEE_PER_SLOT
    const refund = Math.max(0, totalAmount - fee)
    return { cancellationFee: fee, refundAmount: refund }
  }
}

function groupBookings(bookings: Booking[]): BookingGroup[] {
  const groups = new Map<string, Booking[]>()
  
  bookings.forEach(booking => {
    // Group by booking_group_id, or treat each legacy booking as its own group
    const key = booking.booking_group_id || `legacy-${booking.id}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(booking)
  })
  
  // Convert to BookingGroup array with computed properties
  return Array.from(groups.entries()).map(([groupKey, groupBookings]) => {
    // Sort by time slot
    const sorted = [...groupBookings].sort((a, b) => 
      a.time_slot.localeCompare(b.time_slot)
    )
    const first = sorted[0]
    
    // Calculate hours until booking
    const hoursUntilBooking = calculateHoursUntilBooking(sorted)
    
    // Calculate cancellation fee
    const totalAmount = first.payment_amount || 0
    const { cancellationFee, refundAmount } = calculateCancellationFee(
      totalAmount,
      sorted.length,
      hoursUntilBooking
    )
    
    return {
      groupKey,
      bookingGroupId: first.booking_group_id || null,
      shortId: first.short_id || null,
      bookings: sorted,
      date: first.date,
      timeSlots: sorted.map(b => b.time_slot),
      totalAmount,
      paymentStatus: first.payment_status,
      status: getBookingStatus(first),
      hoursUntilBooking,
      cancellationFee,
      refundAmount,
    }
  })
}

function canCancelBookingGroup(group: BookingGroup): { canCancel: boolean; reason?: string } {
  const firstBooking = group.bookings[0]
  
  // Cannot cancel if payment is not confirmed
  if (firstBooking.payment_status && firstBooking.payment_status !== 'confirmed') {
    if (firstBooking.payment_status === 'pending') {
      return { canCancel: false, reason: 'Wait for payment verification' }
    }
    if (firstBooking.payment_status === 'rejected' || firstBooking.payment_status === 'cancelled') {
      return { canCancel: false, reason: 'Booking already cancelled' }
    }
  }

  // Cannot cancel past bookings
  if (group.hoursUntilBooking < 0) {
    return { canCancel: false, reason: 'Cannot cancel past bookings' }
  }
  
  return { canCancel: true }
}

// ============================================================================
// CancelConfirmModal Component
// ============================================================================

interface CancelConfirmModalProps {
  group: BookingGroup
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function CancelConfirmModal({ group, onConfirm, onCancel, isLoading }: CancelConfirmModalProps) {
  const isFreeCancel = group.hoursUntilBooking > CANCELLATION_HOURS_BEFORE
  
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
        
        {/* Booking details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="font-medium text-gray-900">
            {format(parseISO(group.date), 'EEEE, MMMM d, yyyy')}
          </p>
          <p className="text-gray-600">{group.timeSlots.join(', ')}</p>
          {group.timeSlots.length > 1 && (
            <p className="text-sm text-gray-500 mt-1">
              {group.timeSlots.length} time slots
            </p>
          )}
        </div>

        {/* Cancellation fee info */}
        <div className={`rounded-lg p-4 mb-6 ${isFreeCancel ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          {isFreeCancel ? (
            <>
              <p className="font-medium text-green-800">Free Cancellation</p>
              <p className="text-sm text-green-600 mt-1">
                Full refund of <span className="font-semibold">P{group.totalAmount?.toLocaleString()}</span>
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-amber-800">Cancellation Fee Applies</p>
              <div className="text-sm text-amber-700 mt-1 space-y-1">
                <p>
                  Cancellation fee: <span className="font-semibold">P{group.cancellationFee.toLocaleString()}</span>
                  <span className="text-amber-600"> ({group.timeSlots.length} slot{group.timeSlots.length > 1 ? 's' : ''} x P{CANCELLATION_FEE_PER_SLOT})</span>
                </p>
                <p className="font-semibold text-amber-800">
                  Refund amount: P{group.refundAmount.toLocaleString()}
                </p>
              </div>
            </>
          )}
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

// ============================================================================
// BookingGroupCard Component
// ============================================================================

interface BookingGroupCardProps {
  group: BookingGroup
  onCancelClick: (group: BookingGroup) => void
}

function BookingGroupCard({ group, onCancelClick }: BookingGroupCardProps) {
  const cancelCheck = canCancelBookingGroup(group)
  
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        group.status === 'past'
          ? 'bg-gray-50 border-gray-200 opacity-75'
          : group.status === 'today'
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Status badges */}
          <div className="mb-2 flex flex-wrap gap-2">
            {/* Short ID badge */}
            {group.shortId && (
              <span className="px-2 py-1 rounded-md text-xs font-mono font-semibold bg-gray-100 text-gray-800">
                {group.shortId}
              </span>
            )}
            
            {/* Time status badge */}
            {group.status === 'today' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                Today
              </span>
            )}
            {group.status === 'upcoming' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                Upcoming
              </span>
            )}
            {group.status === 'past' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                Completed
              </span>
            )}

            {/* Payment status badge */}
            {group.paymentStatus && (
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${paymentStatusConfig[group.paymentStatus].className}`}>
                <CreditCard className="w-3 h-3" />
                {paymentStatusConfig[group.paymentStatus].label}
              </span>
            )}
          </div>

          {/* Date */}
          <div className="flex items-center gap-2 text-gray-900 font-medium">
            <Calendar className="w-4 h-4 text-gray-400" />
            {format(parseISO(group.date), 'EEEE, MMMM d, yyyy')}
          </div>

          {/* Time slots - comma separated */}
          <div className="flex items-center gap-2 text-gray-600 mt-1">
            <Clock className="w-4 h-4 text-gray-400" />
            {group.timeSlots.join(', ')}
          </div>

          {/* Payment amount (shown once for the group) */}
          {group.totalAmount && group.totalAmount > 0 && group.paymentStatus === 'confirmed' && (
            <p className="text-sm text-green-600 font-medium mt-1">
              P{group.totalAmount.toLocaleString()} paid
            </p>
          )}
          
          {/* Refund info for cancelled bookings */}
          {group.paymentStatus === 'cancelled' && group.bookings[0].refund_amount && group.bookings[0].refund_amount > 0 && (
            <p className="text-sm text-blue-600 font-medium mt-1">
              P{group.bookings[0].refund_amount.toLocaleString()} refund {group.bookings[0].refund_status === 'completed' ? 'processed' : 'pending'}
            </p>
          )}
        </div>

        {/* Cancel button (only for non-past bookings that can be cancelled) */}
        {group.status !== 'past' && group.paymentStatus !== 'cancelled' && (
          <div className="ml-4">
            {cancelCheck.canCancel ? (
              <button
                onClick={() => onCancelClick(group)}
                className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
              >
                Cancel Booking
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
}

// ============================================================================
// Main BookingHistory Component
// ============================================================================

interface BookingHistoryProps {
  bookings: Booking[]
  isLoading: boolean
  onCancelBooking: (bookingGroupId: string | null, legacyBookingId: string) => Promise<void>
  isCancelling: boolean
}

export function BookingHistory({ bookings, isLoading, onCancelBooking, isCancelling }: BookingHistoryProps) {
  const [cancellingGroup, setCancellingGroup] = useState<BookingGroup | null>(null)

  // Group and sort bookings
  const groupedBookings = useMemo(() => {
    const groups = groupBookings(bookings)
    
    // Sort: upcoming first, then today, then past
    return groups.sort((a, b) => {
      const statusOrder = { upcoming: 0, today: 1, past: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      // Within same status, sort by date
      if (a.status === 'past') {
        // Past bookings: most recent first
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
      // Upcoming/today: earliest first
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
  }, [bookings])

  const handleCancelClick = (group: BookingGroup) => {
    setCancellingGroup(group)
  }

  const handleConfirmCancel = async () => {
    if (!cancellingGroup) return
    await onCancelBooking(cancellingGroup.bookingGroupId, cancellingGroup.bookings[0].id)
    setCancellingGroup(null)
  }

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

  return (
    <div className="space-y-4">
      {cancellingGroup && (
        <CancelConfirmModal
          group={cancellingGroup}
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancellingGroup(null)}
          isLoading={isCancelling}
        />
      )}

      {groupedBookings.map((group) => (
        <BookingGroupCard
          key={group.groupKey}
          group={group}
          onCancelClick={handleCancelClick}
        />
      ))}
    </div>
  )
}
