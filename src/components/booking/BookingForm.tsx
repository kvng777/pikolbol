'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BulkBookingPayload } from '@/types/booking'
import { calculatePaymentAmount, isEquipmentChargeable } from '@/lib/paymentConfig'
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

  // Paddles & balls are free during the promo; charged for play dates from June 1, 2026
  const equipmentChargeable = isEquipmentChargeable(selectedDate)

  const totalCost = calculatePaymentAmount(
    selectedSlots.length > 0 ? selectedSlots : ['12:00'],
    2,
    { date: selectedDate, paddles, needsBalls }
  )
  const formattedTotal = `Php${totalCost.toLocaleString()}`

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
        onPaddlesChange={setPaddles}
        onNeedsBallsChange={setNeedsBalls}
        chargeable={equipmentChargeable}
      />

      <Button
        type="submit"
        disabled={isSubmitting}
        className="text-lg w-full bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0 h-11 font-medium"
      >
        {isSubmitting ? 'Booking...' : `Book ${selectedSlots.length} Slot(s) — ${formattedTotal}`}
      </Button>
    </form>
  )
}
