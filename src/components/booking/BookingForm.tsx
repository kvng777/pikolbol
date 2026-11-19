'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BulkBookingPayload } from '@/types/booking'
import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/pricing'
import { usePricingForDate } from '@/hooks/usePricing'
import { EquipmentSelector } from './EquipmentSelector'

export interface BookingFormDefaultValues {
  name?: string
  phone?: string
  email?: string
}

interface BookingFormProps {
  selectedDate: string
  selectedSlots: string[]
  onSubmit: (data: BulkBookingPayload) => Promise<void>
  isSubmitting?: boolean
  defaultValues?: BookingFormDefaultValues
}

export function BookingForm({
  selectedDate,
  selectedSlots,
  onSubmit,
  isSubmitting,
  defaultValues,
}: BookingFormProps) {
  const [paddles, setPaddles] = useState(0)
  const [needsBalls, setNeedsBalls] = useState(false)
  const [trainingBalls, setTrainingBalls] = useState(false)

  // Prices for the selected play date (versioned by the admin Pricing tab)
  const { rules, error: pricingError, isLoading: pricingLoading } = usePricingForDate(selectedDate)
  const noPricesForDate = !pricingLoading && !pricingError && !rules
  const equipmentChargeable = rules ? isEquipmentChargeable(rules, selectedDate) : false

  // Estimate only: the payment screen shows the server-signed amount
  let totalCost: number | null = null
  let priceFailed = false
  if (rules) {
    try {
      totalCost = calculatePaymentAmount(rules, selectedSlots.length > 0 ? selectedSlots : ['12:00'], 2, {
        date: selectedDate,
        paddles,
        needsBalls,
        trainingBalls,
      })
    } catch {
      // A malformed slot string must not crash the page: show the unavailable state.
      priceFailed = true
    }
  }
  const formattedTotal =
    totalCost !== null
      ? `Php${totalCost.toLocaleString()}`
      : pricingError || priceFailed
        ? 'Prices unavailable'
        : noPricesForDate
          ? 'No prices for this date'
          : '…'

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      name: defaultValues?.name ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      date: selectedDate,
      timeSlots: selectedSlots,
      courtNumber: 1,
      players: 2,
      paddles,
      needsBalls,
      trainingBalls,
    })
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-gray-700 text-sm">Selected Time{selectedSlots.length > 1 ? 's' : ''}</Label>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="font-medium text-emerald-700">
            {selectedSlots.length === 1
              ? selectedSlots[0]
              : `${selectedSlots.length} slots: ${selectedSlots.join(', ')}`}
          </p>
        </div>
      </div>

      <EquipmentSelector
        paddles={paddles}
        needsBalls={needsBalls}
        trainingBalls={trainingBalls}
        onPaddlesChange={setPaddles}
        onNeedsBallsChange={setNeedsBalls}
        onTrainingBallsChange={setTrainingBalls}
        chargeable={equipmentChargeable}
        rules={rules}
        pricesUnavailable={!!pricingError || noPricesForDate || priceFailed}
      />

      <Button
        type="submit"
        disabled={isSubmitting || !rules}
        className="text-lg w-full bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0 h-11 font-medium"
      >
        {isSubmitting ? 'Booking...' : `Book ${selectedSlots.length} Slot(s) — ${formattedTotal}`}
      </Button>
    </form>
  )
}
