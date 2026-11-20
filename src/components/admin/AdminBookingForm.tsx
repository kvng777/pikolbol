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
import { calculatePaymentAmount, isEquipmentChargeable, isSamePricedSelection } from '@/lib/pricing'
import { usePricingForDate } from '@/hooks/usePricing'
import { useSlotRules } from '@/hooks/useSlotRules'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { toast } from 'sonner'

const COURT_NUMBER = 1

export interface AdminBookingInitialValues {
  bookingGroupId: string
  name: string
  date: string
  timeSlots: string[]
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
  amount: number | null // Stored payment_amount; kept if the priced selection doesn't change
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
  const [trainingBalls, setTrainingBalls] = useState(initialValues?.trainingBalls ?? false)

  const createBooking = useCreateAdminBooking()
  const updateBooking = useUpdateAdminBooking()
  const isSubmitting = createBooking.isPending || updateBooking.isPending

  const { data: activeBookings = [] } = useActiveBookingsByDate(date)
  const { data: disabledSlots = [] } = useDisabledSlotsByDate(date)
  const { data: closedDates = [] } = useClosedDates()
  const { data: slotRules, isError: slotRulesError, isLoading: slotRulesLoading } = useSlotRules()
  const [confirmOverride, setConfirmOverride] = useState(false)

  const isDateClosed = useMemo(
    () => closedDates.some((cd) => date >= cd.start_date && date <= cd.end_date),
    [closedDates, date]
  )

  // Exclude the edited group's own rows so its current slots remain selectable
  const availableSlots = useMemo(() => {
    const others = initialValues
      ? activeBookings.filter((b) => b.booking_group_id !== initialValues.bookingGroupId)
      : activeBookings
    return getAvailableSlotsForCourt(others, date, COURT_NUMBER, disabledSlots, {
      ignorePast: true,
      bufferMinutes: 0,
      rules: slotRules ?? [],
    })
  }, [activeBookings, disabledSlots, date, initialValues, slotRules])

  // Admins may book slots blocked by a rule or a one-day block, after confirming
  const isOverridable = (reason?: string) => reason === 'rule' || reason === 'disabled'
  // Editing with the same date and slots never needs an override (the server skips the check too)
  const slotsUnchanged =
    !!initialValues &&
    initialValues.date === date &&
    initialValues.timeSlots.length === selectedSlots.length &&
    initialValues.timeSlots.every((t) => selectedSlots.includes(t))
  const blockedSelected = slotsUnchanged
    ? []
    : availableSlots.filter((s) => selectedSlots.includes(s.time) && isOverridable(s.reason))

  const { rules, error: pricingError, isLoading: pricingLoading } = usePricingForDate(date)
  const noPricesForDate = !pricingLoading && !pricingError && !rules
  const equipmentChargeable = rules ? isEquipmentChargeable(rules, date) : false

  const keepsStoredPrice =
    !!initialValues &&
    initialValues.amount !== null &&
    isSamePricedSelection(
      {
        date: initialValues.date,
        timeSlots: initialValues.timeSlots,
        paddles: initialValues.paddles,
        needsBalls: initialValues.needsBalls,
        trainingBalls: initialValues.trainingBalls,
      },
      { date, timeSlots: selectedSlots, paddles, needsBalls, trainingBalls }
    )

  const total = useMemo(() => {
    if (selectedSlots.length === 0) return 0
    if (keepsStoredPrice) return initialValues!.amount as number
    if (!rules) return null
    return calculatePaymentAmount(rules, selectedSlots, 2, { date, paddles, needsBalls, trainingBalls })
  }, [selectedSlots, date, paddles, needsBalls, trainingBalls, rules, keepsStoredPrice, initialValues])

  const toggleSlot = (slot: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    )
  }

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    setSelectedSlots([]) // slots are date-specific
  }

  const save = async (overrideBlocks: boolean) => {
    const payload = { name: name.trim(), date, timeSlots: selectedSlots, paddles, needsBalls, trainingBalls, overrideBlocks }

    try {
      const result = initialValues
        ? await updateBooking.mutateAsync({ bookingGroupId: initialValues.bookingGroupId, payload })
        : await createBooking.mutateAsync(payload)

      if (result.success) {
        const saved = result.bookings?.[0]?.payment_amount
        const amountText = typeof saved === 'number' ? ` (₱${saved.toLocaleString('en-US')})` : ''
        toast.success(`${isEdit ? 'Booking updated' : 'Booking created'}${amountText}`)
        onClose()
      } else {
        toast.error(result.error || 'Failed to save booking')
      }
    } catch {
      toast.error('Failed to save booking')
    }
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

    if (slotRulesError || !slotRules) {
      toast.error("Couldn't load slot rules. Try again in a moment.")
      return
    }
    if (blockedSelected.length > 0) {
      setConfirmOverride(true)
      return
    }
    await save(false)
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
                const blocked = isOverridable(slot.reason)
                const disabled = !slot.available && !blocked && !isSelected
                return (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => (slot.available || blocked || isSelected) && toggleSlot(slot.time)}
                    disabled={disabled}
                    className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                      disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isSelected
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                          : blocked
                            ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:border-amber-400'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      {slot.time}
                      {blocked && <span className="text-[11px] font-normal">{slot.label ?? 'Blocked'}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            {slotRulesError && (
              <p className="text-sm text-red-500">
                Couldn&apos;t load slot rules, so saving is disabled. Close and reopen this form to retry.
              </p>
            )}
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
            trainingBalls={trainingBalls}
            onPaddlesChange={setPaddles}
            onNeedsBallsChange={setNeedsBalls}
            onTrainingBallsChange={setTrainingBalls}
            chargeable={equipmentChargeable}
            rules={rules}
            pricesUnavailable={!!pricingError || noPricesForDate}
          />

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">
              Total
              {keepsStoredPrice && <span className="block text-xs text-gray-500">Original price kept</span>}
            </span>
            <span className="text-xl font-bold text-indigo-700">
              {total === null ? (pricingError ? 'Prices unavailable' : noPricesForDate ? 'No prices for this date' : '…') : `₱${total.toLocaleString()}`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting || total === null || slotRulesError || slotRulesLoading}
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

      <ConfirmationDialog
        open={confirmOverride}
        onClose={() => setConfirmOverride(false)}
        onConfirm={async () => {
          setConfirmOverride(false)
          await save(true)
        }}
        title="Book blocked slots?"
        description="These slots are blocked for customers. Book them anyway for this player?"
        confirmText="Book anyway"
        variant="warning"
        isLoading={isSubmitting}
      >
        <ul className="text-sm text-gray-700 space-y-1">
          {blockedSelected.map((s) => (
            <li key={s.time}>
              {s.time}: {s.label ? `blocked by "${s.label}"` : 'Blocked'}
            </li>
          ))}
        </ul>
      </ConfirmationDialog>
    </div>
  )
}
