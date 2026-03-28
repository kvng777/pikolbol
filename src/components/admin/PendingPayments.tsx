'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle, XCircle, AlertTriangle, Loader2, User, Calendar, Clock, Users, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePendingPayments, useConfirmPayment, useRejectPayment } from '@/hooks/usePayment'
import { PendingPaymentBooking, PaymentStatus } from '@/types/payment'
import { toast } from 'sonner'

// Group bookings by user (same name, email, date, and close deadline = same booking session)
function groupBookings(bookings: PendingPaymentBooking[]): Map<string, PendingPaymentBooking[]> {
  const groups = new Map<string, PendingPaymentBooking[]>()
  
  bookings.forEach(booking => {
    // Group key: name + email + date + deadline (rounded to minute)
    // Protect against null/undefined payment_deadline before calling substring
    const deadlineRaw = booking.payment_deadline ?? ''
    const deadlineMinute = (typeof deadlineRaw === 'string' && deadlineRaw.length >= 16)
      ? deadlineRaw.substring(0, 16)
      : deadlineRaw
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
  const createdAt = firstBooking.created_at
  
  // Ensure payment_amount is a number and provide a safe fallback
  const rawAmount = firstBooking.payment_amount
  const totalAmount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount ?? 0)
  const formattedAmount = Number.isFinite(totalAmount) ? totalAmount.toLocaleString() : '0'
  const timeSlots = bookings.map(b => b.time_slot).join(', ')
  
  // Calculate time since submission
  const submittedAt = createdAt ? new Date(createdAt) : new Date()
  const minutesAgo = Math.floor((Date.now() - submittedAt.getTime()) / (1000 * 60))
  const timeAgo = minutesAgo < 60 
    ? `${minutesAgo}m ago` 
    : `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`

  return (
    <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <AlertTriangle className="w-3 h-3" />
              Needs Verification
            </span>
            <span className="text-xs text-gray-500">
              Submitted {timeAgo}
            </span>
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
              Php {formattedAmount}
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

  // Group bookings by user/date
  const groupedBookings = Array.from(groupBookings(pendingBookings).values())

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
        <p className="text-sm text-amber-600 font-medium">Awaiting Verification</p>
        <p className="text-2xl font-bold text-amber-700">{groupedBookings.length}</p>
        <p className="text-xs text-amber-600 mt-1">
          Customers have submitted payment, please verify via GCash
        </p>
      </div>

      {/* Pending Verification List */}
      <div>
        <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-3">
          Needs Verification ({groupedBookings.length})
        </h3>
        <div className="space-y-3">
          {groupedBookings.map((group) => (
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

      <p className="text-xs text-gray-400 text-center">
        Payments auto-refresh every 10 seconds.
      </p>
    </div>
  )
}
