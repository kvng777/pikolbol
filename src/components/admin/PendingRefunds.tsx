'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle, Loader2, User, Calendar, Clock, CreditCard, Banknote, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { usePendingRefunds, useMarkRefundCompleted } from '@/hooks/useRefunds'
import { Booking } from '@/types/booking'
import { toast } from 'sonner'

// ============================================================================
// Types
// ============================================================================

interface RefundGroup {
  groupKey: string
  bookingGroupId: string | null
  shortId: string | null
  bookings: Booking[]
  customerName: string
  customerEmail: string
  customerPhone: string
  date: string
  timeSlots: string[]
  originalAmount: number
  cancellationFee: number
  refundAmount: number
  cancelledAt: string | null
}

interface PendingAction {
  group: RefundGroup
}

// ============================================================================
// Helpers
// ============================================================================

function groupRefunds(bookings: Booking[]): RefundGroup[] {
  const groups = new Map<string, Booking[]>()
  
  bookings.forEach(booking => {
    const key = booking.booking_group_id || `legacy-${booking.id}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(booking)
  })
  
  return Array.from(groups.entries()).map(([groupKey, groupBookings]) => {
    const sorted = [...groupBookings].sort((a, b) => 
      a.time_slot.localeCompare(b.time_slot)
    )
    const first = sorted[0]
    
    return {
      groupKey,
      bookingGroupId: first.booking_group_id || null,
      shortId: first.short_id || null,
      bookings: sorted,
      customerName: first.name,
      customerEmail: first.email,
      customerPhone: first.phone,
      date: first.date,
      timeSlots: sorted.map(b => b.time_slot),
      originalAmount: first.payment_amount || 0,
      cancellationFee: first.cancellation_fee || 0,
      refundAmount: first.refund_amount || 0,
      cancelledAt: first.cancelled_at || null,
    }
  })
}

// ============================================================================
// RefundCard Component
// ============================================================================

interface RefundCardProps {
  group: RefundGroup
  onMarkCompleted: (group: RefundGroup) => void
  isProcessing: boolean
}

function RefundCard({ group, onMarkCompleted, isProcessing }: RefundCardProps) {
  const cancelledAt = group.cancelledAt ? new Date(group.cancelledAt) : new Date()
  const minutesAgo = Math.floor((Date.now() - cancelledAt.getTime()) / (1000 * 60))
  const timeAgo = minutesAgo < 60 
    ? `${minutesAgo}m ago` 
    : minutesAgo < 1440
    ? `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`
    : `${Math.floor(minutesAgo / 1440)}d ago`

  return (
    <div className="rounded-xl border p-4 bg-blue-50 border-blue-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Status Badge & Booking ID */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {group.shortId && (
              <span className="px-2 py-1 rounded-md text-sm font-mono font-semibold bg-gray-100 text-gray-800">
                {group.shortId}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              <Banknote className="w-3 h-3" />
              Refund Pending
            </span>
            <span className="text-xs text-gray-500">
              Cancelled {timeAgo}
            </span>
          </div>

          {/* Customer Info */}
          <div className="flex items-center gap-2 text-gray-900 font-medium mb-1">
            <User className="w-4 h-4 text-gray-400" />
            {group.customerName}
          </div>
          <p className="text-sm text-gray-500 mb-1">{group.customerEmail}</p>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Phone className="w-3 h-3 text-gray-400" />
            {group.customerPhone}
          </div>

          {/* Booking Details */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              {format(parseISO(group.date), 'EEEE, MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              {group.timeSlots.join(', ')}
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="mt-3 pt-3 border-t border-blue-200 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Original payment:</span>
              <span>P{group.originalAmount.toLocaleString()}</span>
            </div>
            {group.cancellationFee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Cancellation fee:</span>
                <span className="text-red-600">-P{group.cancellationFee.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-blue-700">
              <span>Refund amount:</span>
              <span>P{group.refundAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={() => onMarkCompleted(group)}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Mark Refunded
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// RefundDetailsSummary Component
// ============================================================================

function RefundDetailsSummary({ group }: { group: RefundGroup }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
      {group.shortId && (
        <div className="flex justify-between">
          <span className="text-gray-500">Booking ID</span>
          <span className="font-mono font-semibold text-gray-900">{group.shortId}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-gray-500">Customer</span>
        <span className="font-medium text-gray-900">{group.customerName}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Phone (GCash)</span>
        <span className="font-medium text-gray-900">{group.customerPhone}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Date</span>
        <span className="text-gray-900">{format(parseISO(group.date), 'MMM d, yyyy')}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Time</span>
        <span className="text-gray-900">{group.timeSlots.join(', ')}</span>
      </div>
      <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
        <span className="text-gray-500">Refund Amount</span>
        <span className="font-semibold text-blue-600">P{group.refundAmount.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Main PendingRefunds Component
// ============================================================================

export function PendingRefunds() {
  const { data: pendingBookings = [], isLoading } = usePendingRefunds()
  const markCompleted = useMarkRefundCompleted()
  
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const groupedRefunds = useMemo(() => {
    return groupRefunds(pendingBookings)
  }, [pendingBookings])

  const handleMarkCompleted = (group: RefundGroup) => {
    setPendingAction({ group })
  }

  const handleCloseDialog = () => {
    if (!isProcessing) {
      setPendingAction(null)
    }
  }

  const handleExecuteAction = async () => {
    if (!pendingAction) return

    setIsProcessing(true)
    try {
      const result = await markCompleted.mutateAsync({
        bookingGroupId: pendingAction.group.bookingGroupId,
        legacyBookingId: pendingAction.group.bookingGroupId ? null : pendingAction.group.bookings[0].id,
      })
      
      if (result.success) {
        toast.success('Refund marked as completed!')
        setPendingAction(null)
      } else {
        toast.error(result.error || 'Failed to mark refund as completed')
      }
    } catch {
      toast.error('Failed to mark refund as completed')
    } finally {
      setIsProcessing(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  // Empty state
  if (groupedRefunds.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
          <Banknote className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Pending Refunds</h3>
        <p className="text-gray-500">All refunds have been processed.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-row gap-2 mb-3">
          <p className="text-md font-semibold text-blue-700 uppercase">
            Pending Refunds ({groupedRefunds.length})
          </p>
        </div>
        <p className="text-sm text-blue-600 mb-4">
          Process refunds via GCash using the customer&apos;s phone number, then mark as completed
        </p>
        
        {/* Refund cards */}
        <div className="space-y-3">
          {groupedRefunds.map((group) => (
            <RefundCard
              key={group.groupKey}
              group={group}
              onMarkCompleted={handleMarkCompleted}
              isProcessing={isProcessing}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Refunds auto-refresh every 10 seconds.
      </p>

      {/* Confirmation Dialog */}
      {pendingAction && (
        <ConfirmationDialog
          open={!!pendingAction}
          onClose={handleCloseDialog}
          onConfirm={handleExecuteAction}
          title="Confirm Refund Completed"
          description="Have you sent the refund via GCash? This will mark the refund as processed."
          confirmText="Yes, Refund Sent"
          cancelText="Cancel"
          variant="confirm"
          isLoading={isProcessing}
        >
          <RefundDetailsSummary group={pendingAction.group} />
        </ConfirmationDialog>
      )}
    </div>
  )
}
