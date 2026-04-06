'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle, XCircle, AlertTriangle, Loader2, User, Calendar, Clock, CreditCard, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { usePendingPayments, useConfirmPayment, useRejectPayment } from '@/hooks/usePayment'
import { PendingPaymentBooking } from '@/types/payment'
import { toast } from 'sonner'

// ============================================================================
// Types
// ============================================================================

interface PendingAction {
  type: 'confirm' | 'reject'
  bookingIds: string[]
  bookingDetails: {
    shortId?: string | null
    name: string
    amount: string
    timeSlots: string
    date: string
    gcashReference?: string | null
  }
}

// ============================================================================
// Helpers
// ============================================================================

// Group bookings by booking_group_id (unique per booking order)
// This ensures separate booking orders are shown as separate cards for verification
function groupBookings(bookings: PendingPaymentBooking[]): Map<string, PendingPaymentBooking[]> {
  const groups = new Map<string, PendingPaymentBooking[]>()
  
  bookings.forEach(booking => {
    // Group by booking_group_id (unique per booking order)
    // Fallback to legacy grouping for old bookings without booking_group_id
    const key = booking.booking_group_id || 
      `legacy-${booking.name}-${booking.email}-${booking.date}-${booking.created_at}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(booking)
  })
  
  return groups
}

// ============================================================================
// BookingGroupCard Component
// ============================================================================

interface BookingGroupCardProps {
  bookings: PendingPaymentBooking[]
  onConfirmClick: (action: PendingAction) => void
  onRejectClick: (action: PendingAction) => void
  isProcessing: boolean
}

function BookingGroupCard({ bookings, onConfirmClick, onRejectClick, isProcessing }: BookingGroupCardProps) {
  const [copiedId, setCopiedId] = useState(false)
  const firstBooking = bookings[0]
  const bookingIds = bookings.map(b => b.id)
  const createdAt = firstBooking.created_at
  const shortId = firstBooking.short_id
  
  // Ensure payment_amount is a number and provide a safe fallback
  const rawAmount = firstBooking.payment_amount
  const totalAmount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount ?? 0)
  const formattedAmount = Number.isFinite(totalAmount) ? totalAmount.toLocaleString() : '0'
  const timeSlots = bookings.map(b => b.time_slot).join(', ')
  const formattedDate = format(parseISO(firstBooking.date), 'EEEE, MMM d, yyyy')
  
  // Calculate time since submission
  const submittedAt = createdAt ? new Date(createdAt) : new Date()
  const minutesAgo = Math.floor((Date.now() - submittedAt.getTime()) / (1000 * 60))
  const timeAgo = minutesAgo < 60 
    ? `${minutesAgo}m ago` 
    : `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`

  const handleCopyId = async () => {
    if (!shortId) return
    try {
      await navigator.clipboard.writeText(shortId)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Prepare action data for dialogs
  const actionData: PendingAction['bookingDetails'] = {
    shortId,
    name: firstBooking.name,
    amount: formattedAmount,
    timeSlots,
    date: formattedDate,
    gcashReference: firstBooking.gcash_reference,
  }

  const handleConfirmClick = () => {
    onConfirmClick({
      type: 'confirm',
      bookingIds,
      bookingDetails: actionData,
    })
  }

  const handleRejectClick = () => {
    onRejectClick({
      type: 'reject',
      bookingIds,
      bookingDetails: actionData,
    })
  }

  return (
    <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Status Badge & Booking ID */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {shortId && (
              <button
                onClick={handleCopyId}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-mono font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                title="Click to copy Booking ID"
              >
                {shortId}
                {copiedId ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-400" />
                )}
              </button>
            )}
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
              {formattedDate}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              {timeSlots}
            </div>
            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
              <CreditCard className="w-4 h-4" />
              Php {formattedAmount}
            </div>
            {firstBooking.gcash_reference && (
              <div className="flex items-center gap-2 text-gray-600 text-sm mt-1">
                <span className="text-gray-400 text-xs uppercase font-medium">GCash Ref:</span>
                <span className="font-mono font-semibold text-gray-800">{firstBooking.gcash_reference}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={handleConfirmClick}
            disabled={isProcessing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRejectClick}
            disabled={isProcessing}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <XCircle className="w-4 h-4 mr-1" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// BookingDetailsSummary - Reusable component for dialog content
// ============================================================================

function BookingDetailsSummary({ details }: { details: PendingAction['bookingDetails'] }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
      {details.shortId && (
        <div className="flex justify-between">
          <span className="text-gray-500">Booking ID</span>
          <span className="font-mono font-semibold text-gray-900">{details.shortId}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-gray-500">Customer</span>
        <span className="font-medium text-gray-900">{details.name}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Date</span>
        <span className="text-gray-900">{details.date}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Time</span>
        <span className="text-gray-900">{details.timeSlots}</span>
      </div>
      <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
        <span className="text-gray-500">Amount</span>
        <span className="font-semibold text-emerald-600">Php {details.amount}</span>
      </div>
      {details.gcashReference && (
        <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
          <span className="text-gray-500">GCash Ref</span>
          <span className="font-mono font-semibold text-gray-900">{details.gcashReference}</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main PendingPayments Component
// ============================================================================

export function PendingPayments() {
  const { data: pendingBookings = [], isLoading } = usePendingPayments()
  const confirmPayment = useConfirmPayment()
  const rejectPayment = useRejectPayment()
  
  // Dialog state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Open confirmation dialog
  const handleConfirmClick = (action: PendingAction) => {
    setPendingAction(action)
  }

  // Open rejection dialog
  const handleRejectClick = (action: PendingAction) => {
    setPendingAction(action)
  }

  // Close dialog
  const handleCloseDialog = () => {
    if (!isProcessing) {
      setPendingAction(null)
    }
  }

  // Execute the confirmed action
  const handleExecuteAction = async () => {
    if (!pendingAction) return

    setIsProcessing(true)
    try {
      if (pendingAction.type === 'confirm') {
        const result = await confirmPayment.mutateAsync(pendingAction.bookingIds)
        if (result.success) {
          toast.success('Payment confirmed! Customer has been notified.')
          setPendingAction(null)
        } else {
          toast.error(result.error || 'Failed to confirm payment')
        }
      } else {
        const result = await rejectPayment.mutateAsync({ bookingIds: pendingAction.bookingIds })
        if (result.success) {
          toast.success('Payment rejected. Slot has been released.')
          setPendingAction(null)
        } else {
          toast.error(result.error || 'Failed to reject payment')
        }
      }
    } catch {
      toast.error(`Failed to ${pendingAction.type} payment`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  // Empty state
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

  // Group bookings by booking_group_id
  const groupedBookings = Array.from(groupBookings(pendingBookings).values())

  // Dialog content based on action type
  const dialogConfig = pendingAction?.type === 'confirm' 
    ? {
        title: 'Confirm Payment',
        description: 'Are you sure you want to confirm this payment? The customer will be notified that their booking is confirmed.',
        confirmText: 'Yes, Confirm Payment',
        variant: 'confirm' as const,
      }
    : {
        title: 'Reject Payment',
        description: 'Are you sure you want to reject this payment? The time slot will be released and the customer will be notified.',
        confirmText: 'Yes, Reject Payment',
        variant: 'reject' as const,
      }

  return (
    <div className="space-y-6">
      {/* Pending Verification List */}
      <div>
        <div className="flex flex-row gap-2 mb-3">
          <p className="text-md font-semibold text-amber-700 uppercase">
            Needs Verification ({groupedBookings.length})
          </p>
          <p className="text-sm text-amber-600 align-self-center">
            Customers have submitted payment, please verify via GCash
          </p>
        </div>
        <div className="space-y-3">
          {groupedBookings.map((group) => (
            <BookingGroupCard
              key={group[0].id}
              bookings={group}
              onConfirmClick={handleConfirmClick}
              onRejectClick={handleRejectClick}
              isProcessing={isProcessing}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Payments auto-refresh every 10 seconds.
      </p>

      {/* Confirmation Dialog */}
      {pendingAction && (
        <ConfirmationDialog
          open={!!pendingAction}
          onClose={handleCloseDialog}
          onConfirm={handleExecuteAction}
          title={dialogConfig.title}
          description={dialogConfig.description}
          confirmText={dialogConfig.confirmText}
          cancelText="Cancel"
          variant={dialogConfig.variant}
          isLoading={isProcessing}
        >
          <BookingDetailsSummary details={pendingAction.bookingDetails} />
        </ConfirmationDialog>
      )}
    </div>
  )
}
