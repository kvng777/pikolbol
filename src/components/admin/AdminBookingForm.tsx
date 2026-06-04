'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { X, Loader2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EquipmentSelector } from '@/components/booking/EquipmentSelector'
import { useActiveBookingsByDate, useDisabledSlotsByDate, useClosedDates } from '@/hooks/useBookings'
import { useCreateAdminBooking, useUpdateAdminBooking } from '@/hooks/useBookings'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'
import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/paymentConfig'
import { toast } from 'sonner'

const COURT_NUMBER = 1

export interface AdminBookingInitialValues {
  bookingGroupId: string
  name: string
  date: string
  timeSlots: string[]
  paddles: number
  needsBalls: boolean
}

interface AdminBookingFormProps {
  onClose: () => void
  /** When provided, the form runs in edit mode for this manual booking group. */
  initialValues?: AdminBookingInitialValues | null
}

/**
 * Admin manual-booking modal (create + edit). Mount it only while open and
 * give it a stable `key` per session so initial state derives from props.
 */
export function AdminBookingForm({ onClose, initialValues }: AdminBookingFormProps) {
  const isEdit = !!initialValues

  const [name, setName] = useState(initialValues?.name ?? '')
  const [date, setDate] = useState(initialValues?.date ?? format(new Date(), 'yyyy-MM-dd'))
  const [selectedSlots, setSelectedSlots] = useState<string[]>(initialValues?.timeSlots ?? [])
  const [paddles, setPaddles] = useState(initialValues?.paddles ?? 0)
  const [needsBalls, setNeedsBalls] = useState(initialValues?.needsBalls ?? false)

  const createBooking = useCreateAdminBooking()
  const updateBooking = useUpdateAdminBooking()
  const isSubmitting = createBooking.isPending || updateBooking.isPending

  const { data: activeBookings = [] } = useActiveBookingsByDate(date)
  const { data: disabledSlots = [] } = useDisabledSlotsByDate(date)
  const { data: closedDates = [] } = useClosedDates()

  const isDateClosed = useMemo(
    () => closedDates.some((cd) => date >= cd.start_date && date <= cd.end_date),
    [closedDates, date]
  )

  // Exclude the edited group's own rows so its current slots remain selectable
  const availableSlots = useMemo(() => {
    const others = initialValues
      ? activeBookings.filter((b) => b.booking_group_id !== initialValues.bookingGroupId)
      : activeBookings
    return getAvailableSlotsForCourt(others, date, COURT_NUMBER, disabledSlots, true)
  }, [activeBookings, disabledSlots, date, initialValues])

  const equipmentChargeable = isEquipmentChargeable(date)
  const total = useMemo(
    () =>
      selectedSlots.length > 0
        ? calculatePaymentAmount(selectedSlots, 2, { date, paddles, needsBalls })
        : 0,
    [selectedSlots, date, paddles, needsBalls]
  )

  const toggleSlot = (slot: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    )
  }

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    setSelectedSlots([]) // slots are date-specific
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter the player name')
      return
    }
    if (selectedSlots.length === 0) {
      toast.error('Please select at least one time slot')
      return
    }
    if (isDateClosed) {
      toast.error('The court is closed on this date')
      return
    }

    const payload = { name: name.trim(), date, timeSlots: selectedSlots, paddles, needsBalls }

    try {
      const result = initialValues
        ? await updateBooking.mutateAsync({ bookingGroupId: initialValues.bookingGroupId, payload })
        : await createBooking.mutateAsync(payload)

      if (result.success) {
        toast.success(isEdit ? 'Booking updated' : 'Booking created')
        onClose()
      } else {
        toast.error(result.error || 'Failed to save booking')
      }
    } catch {
      toast.error('Failed to save booking')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <UserCog className="w-5 h-5" />
            <h2 className="text-lg font-bold">{isEdit ? 'Edit Manual Booking' : 'New Manual Booking'}</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Player name */}
          <div className="space-y-2">
            <Label htmlFor="player-name" className="text-sm font-medium text-gray-700">
              Full Name
            </Label>
            <Input
              id="player-name"
              placeholder="e.g., Juan Dela Cruz"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="booking-date" className="text-sm font-medium text-gray-700">
              Date
            </Label>
            <input
              id="booking-date"
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            {isDateClosed && (
              <p className="text-sm text-red-500">The court is closed on this date.</p>
            )}
          </div>

          {/* Time slots */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Time Slots</Label>
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              {availableSlots.map((slot) => {
                const isSelected = selectedSlots.includes(slot.time)
                const disabled = !slot.available && !isSelected
                return (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => slot.available && toggleSlot(slot.time)}
                    disabled={disabled}
                    className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                      disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isSelected
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {slot.time}
                  </button>
                )
              })}
            </div>
            {selectedSlots.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {/* Equipment */}
          <EquipmentSelector
            paddles={paddles}
            needsBalls={needsBalls}
            onPaddlesChange={setPaddles}
            onNeedsBallsChange={setNeedsBalls}
            chargeable={equipmentChargeable}
          />

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-xl font-bold text-indigo-700">₱{total.toLocaleString()}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Booking'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
