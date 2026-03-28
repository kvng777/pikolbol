'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Clock, CheckCircle, XCircle, AlertTriangle, Loader2, User, Calendar, Users, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePendingPayments, useConfirmPayment, useRejectPayment, usePaymentCountdown } from '@/hooks/usePayment'
import { PendingPaymentBooking, PaymentStatus } from '@/types/payment'
import { toast } from 'sonner'

// Group bookings by user (same name, email, date, and close deadline = same booking session)
function groupBookings(bookings: PendingPaymentBooking[]): Map<string, PendingPaymentBooking[]> {
  const groups = new Map<string, PendingPaymentBooking[]>()
  
  bookings.forEach(booking => {
    // Group key: name + email + date + deadline (rounded to minute)
    const deadlineMinute = booking.payment_deadline.substring(0, 16)
    const key = `${booking.name}-${booking.email}-${booking.date}-${deadlineMinute}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(booking)
  })
  
  return groups
}

interface BookingGroupCardProps {
  bookings: PendingPaymentBooking[]
  onConfirm: (ids: string[]) => void
  onReject: (ids: string[]) => void
  isConfirming: boolean
  isRejecting: boolean
}

function BookingGroupCard({ bookings, onConfirm, onReject, isConfirming, isRejecting }: BookingGroupCardProps) {
  const firstBooking = bookings[0]
  const bookingIds = bookings.map(b => b.id)
  const deadline = firstBooking.payment_deadline
  const { formattedTime, remainingSeconds, isExpired } = usePaymentCountdown(deadline)
  
  const status = firstBooking.payment_status as PaymentStatus
  const isAwaitingConfirmation = status === 'awaiting_confirmation'
  const totalAmount = firstBooking.payment_amount
  const timeSlots = bookings.map(b => b.time_slot).join(', ')

  return (
    <div className={`rounded-xl border p-4 ${
      isAwaitingConfirmation 
        ? 'bg-amber-50 border-amber-200' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-3">
            {isAwaitingConfirmation ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                <AlertTriangle className="w-3 h-3" />
                Awaiting Confirmation
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                <Clock className="w-3 h-3" />
                Pending Payment
              </span>
            )}
            
            {/* Timer */}
            {!isExpired && (
              <span className={`text-xs font-medium ${
                remainingSeconds < 120 ? 'text-red-600' : 'text-gray-500'
              }`}>
                {formattedTime} left
              </span>
            )}
          </div>

          {/* Customer Info */}
          <div className="flex items-center gap-2 text-gray-900 font-medium mb-1">
            <User className="w-4 h-4 text-gray-400" />
            {firstBooking.name}
          </div>
          <p className="text-sm text-gray-500 mb-3">{firstBooking.email}</p>

          {/* Booking Details */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              {format(parseISO(firstBooking.date), 'EEEE, MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              {timeSlots}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4 text-gray-400" />
              {firstBooking.players} players
            </div>
            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
              <CreditCard className="w-4 h-4" />
              Php {totalAmount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={() => onConfirm(bookingIds)}
            disabled={isConfirming || isRejecting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-1" />
                Confirm
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(bookingIds)}
            disabled={isConfirming || isRejecting}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PendingPayments() {
  const { data: pendingBookings = [], isLoading } = usePendingPayments()
  const confirmPayment = useConfirmPayment()
  const rejectPayment = useRejectPayment()
  const [processingIds, setProcessingIds] = useState<string[]>([])

  const handleConfirm = async (bookingIds: string[]) => {
    setProcessingIds(bookingIds)
    try {
      const result = await confirmPayment.mutateAsync(bookingIds)
      if (result.success) {
        toast.success('Payment confirmed! Customer has been notified.')
      } else {
        toast.error(result.error || 'Failed to confirm payment')
      }
    } catch {
      toast.error('Failed to confirm payment')
    } finally {
      setProcessingIds([])
    }
  }

  const handleReject = async (bookingIds: string[]) => {
    setProcessingIds(bookingIds)
    try {
      const result = await rejectPayment.mutateAsync({ bookingIds })
      if (result.success) {
        toast.success('Payment rejected. Slot has been released.')
      } else {
        toast.error(result.error || 'Failed to reject payment')
      }
    } catch {
      toast.error('Failed to reject payment')
    } finally {
      setProcessingIds([])
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (pendingBookings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
          <CreditCard className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Pending Payments</h3>
        <p className="text-gray-500">All payments have been processed.</p>
      </div>
    )
  }

  // Group bookings
  const groupedBookings = groupBookings(pendingBookings)
  
  // Separate awaiting confirmation (priority) from pending
  const awaitingConfirmation: PendingPaymentBooking[][] = []
  const pending: PendingPaymentBooking[][] = []
  
  groupedBookings.forEach(group => {
    if (group[0].payment_status === 'awaiting_confirmation') {
      awaitingConfirmation.push(group)
    } else {
      pending.push(group)
    }
  })

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-sm text-amber-600 font-medium">Awaiting Confirmation</p>
          <p className="text-2xl font-bold text-amber-700">{awaitingConfirmation.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-sm text-blue-600 font-medium">Pending Payment</p>
          <p className="text-2xl font-bold text-blue-700">{pending.length}</p>
        </div>
      </div>

      {/* Awaiting Confirmation (Priority) */}
      {awaitingConfirmation.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
            Needs Verification ({awaitingConfirmation.length})
          </h3>
          <div className="space-y-3">
            {awaitingConfirmation.map((group, idx) => (
              <BookingGroupCard
                key={group[0].id}
                bookings={group}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isConfirming={processingIds.includes(group[0].id) && confirmPayment.isPending}
                isRejecting={processingIds.includes(group[0].id) && rejectPayment.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending Payment */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Waiting for Payment ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((group, idx) => (
              <BookingGroupCard
                key={group[0].id}
                bookings={group}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isConfirming={processingIds.includes(group[0].id) && confirmPayment.isPending}
                isRejecting={processingIds.includes(group[0].id) && rejectPayment.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Payments auto-refresh every 10 seconds. Expired payments are automatically removed.
      </p>
    </div>
  )
}
