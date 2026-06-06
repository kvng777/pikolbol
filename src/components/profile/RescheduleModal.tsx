'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarPicker } from '@/components/booking/CalendarPicker'
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker'
import { useActiveBookingsByDate, useDisabledSlotsByDate, useClosedDates, useHeldRescheduleSlotsByDate } from '@/hooks/useBookings'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'
import { Booking } from '@/types/booking'
import { X, Loader2, ArrowRight, Calendar, Clock, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ============================================================================
// Types
// ============================================================================

interface RescheduleGroup {
  bookingGroupId: string | null
  bookings: Booking[]
  date: string
  timeSlots: string[]
  shortId: string | null
}

interface RescheduleModalProps {
  group: RescheduleGroup
  onConfirm: (newDate: string, newTimeSlots: string[]) => Promise<boolean>
  onClose: () => void
  isSubmitting: boolean
}

// ============================================================================
// RescheduleModal
// ============================================================================

export function RescheduleModal({ group, onConfirm, onClose, isSubmitting }: RescheduleModalProps) {
  const requiredSlotCount = group.timeSlots.length

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const dateStr = format(selectedDate, 'yyyy-MM-dd')

  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  // Data for slot availability
  const { data: activeBookings = [], isLoading: bookingsLoading } = useActiveBookingsByDate(dateStr)
  const { data: disabledSlots = [], isLoading: slotsLoading } = useDisabledSlotsByDate(dateStr)
  const { data: closedDates = [] } = useClosedDates()
  const { data: heldSlots = [], isLoading: heldLoading } = useHeldRescheduleSlotsByDate(dateStr)

  // On the same date as the original booking, keep own group's slots as "booked"
  // so the user can't re-select the same time. On a different date, exclude them.
  const filteredBookings = useMemo(() => {
    const groupId = group.bookingGroupId
    if (!groupId || dateStr === group.date) return activeBookings
    return activeBookings.filter((b) => b.booking_group_id !== groupId)
  }, [activeBookings, group.bookingGroupId, dateStr, group.date])

  // Past slots disabled, no 30-min buffer, held reschedule slots shown as booked
  const availableSlots = useMemo(
    () => getAvailableSlotsForCourt(filteredBookings, dateStr, 1, disabledSlots, {
      ignorePast: false,
      bufferMinutes: 0,
      heldSlots,
    }),
    [filteredBookings, dateStr, disabledSlots, heldSlots]
  )

  const isLoadingSlots = bookingsLoading || slotsLoading || heldLoading

  // Free-flow slot selection: auto-replace oldest when at max count
  const handleSelectSlots = (slots: string[]) => {
    if (slots.length <= requiredSlotCount) {
      setSelectedSlots(slots)
    } else {
      // At max — the newly clicked slot is the one not in current selection; replace oldest
      const newSlot = slots.find((s) => !selectedSlots.includes(s))
      if (newSlot) {
        setSelectedSlots([...selectedSlots.slice(1), newSlot])
      }
    }
  }

  const handleDateChange = (date: Date) => {
    setSelectedDate(date)
    setSelectedSlots([])
  }

  const canConfirm = selectedSlots.length === requiredSlotCount && !isSubmitting

  const isSameAsOriginal =
    dateStr === group.date &&
    selectedSlots.length === group.timeSlots.length &&
    [...selectedSlots].sort().join(',') === [...group.timeSlots].sort().join(',')

  const handleSubmit = async () => {
    const success = await onConfirm(dateStr, [...selectedSlots].sort())
    if (success) {
      setSubmitted(true)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-4">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Request Submitted!</h3>
          <p className="text-gray-600 mb-6">
            Your reschedule request has been sent to the admin for review. You&apos;ll receive a confirmation email once it&apos;s approved.
          </p>
          <Button onClick={onClose} className="bg-teal-600 hover:bg-teal-700 text-white px-8">
            Got It
          </Button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-lg font-semibold text-gray-900">Reschedule Booking</h3>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Current booking summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Current Booking {group.shortId && <span className="font-mono text-gray-700">({group.shortId})</span>}
            </p>
            <div className="flex items-center gap-2 text-gray-900 text-sm font-medium">
              <Calendar className="w-4 h-4 text-gray-400" />
              {format(parseISO(group.date), 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2 text-gray-600 text-sm mt-1">
              <Clock className="w-4 h-4 text-gray-400" />
              {group.timeSlots.join(', ')}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select New Date</label>
            <CalendarPicker
              selected={selectedDate}
              onSelect={handleDateChange}
              closedDates={closedDates}
            />
          </div>

          {/* Time slot picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select {requiredSlotCount} Time Slot{requiredSlotCount > 1 ? 's' : ''}
            </label>
            <TimeSlotPicker
              slots={availableSlots}
              selectedSlots={selectedSlots}
              onSelectSlots={handleSelectSlots}
              isLoading={isLoadingSlots}
            />
            {requiredSlotCount > 1 && selectedSlots.length > 0 && selectedSlots.length < requiredSlotCount && (
              <p className="text-sm text-amber-600 mt-2">
                Select {requiredSlotCount - selectedSlots.length} more slot{requiredSlotCount - selectedSlots.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Summary when ready */}
          {canConfirm && !isSameAsOriginal && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-xs font-medium text-teal-700 uppercase tracking-wide mb-3">Requested Schedule</p>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-1 text-gray-500">
                  <p className="font-medium">{format(parseISO(group.date), 'MMM d, yyyy')}</p>
                  <p>{group.timeSlots.join(', ')}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1 text-teal-800 font-medium">
                  <p>{format(selectedDate, 'MMM d, yyyy')}</p>
                  <p>{[...selectedSlots].sort().join(', ')}</p>
                </div>
              </div>
            </div>
          )}

          {isSameAsOriginal && selectedSlots.length === requiredSlotCount && (
            <p className="text-sm text-gray-500 text-center">
              This is the same as your current schedule. Pick a different date or time.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3 rounded-b-2xl">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canConfirm || isSameAsOriginal || isSubmitting}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </span>
            ) : (
              'Submit Request'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
