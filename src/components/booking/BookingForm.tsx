'use client'

import React, { useState } from 'react'
import { Minus, Plus, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BulkBookingPayload } from '@/types/booking'
import {
  calculatePaymentAmount,
  isEquipmentChargeable,
  PADDLE_PRICE,
  BALL_SET_PRICE,
  MAX_PADDLES,
} from '@/lib/paymentConfig'

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

  const adjustPaddles = (delta: number) => {
    setPaddles((prev) => Math.min(MAX_PADDLES, Math.max(0, prev + delta)))
  }

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

  const paddleLabel = equipmentChargeable ? `Php${PADDLE_PRICE} each` : 'FREE (promo)'
  const ballLabel = equipmentChargeable ? `Php${BALL_SET_PRICE} / set of 4` : 'FREE (promo)'

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

      {/* Equipment rental (optional) */}
      <div className="space-y-3">
        <Label className="text-gray-700 text-sm">Equipment (optional)</Label>

        {/* Paddles */}
        <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-900">Paddles</p>
            <p className="text-xs text-gray-500">{paddleLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjustPaddles(-1)}
              disabled={paddles === 0}
              aria-label="Decrease paddles"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center text-sm font-semibold text-gray-900">{paddles}</span>
            <button
              type="button"
              onClick={() => adjustPaddles(1)}
              disabled={paddles >= MAX_PADDLES}
              aria-label="Increase paddles"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Balls */}
        <button
          type="button"
          onClick={() => setNeedsBalls((prev) => !prev)}
          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
            needsBalls
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 text-left">
            <CircleDot className={`w-4 h-4 ${needsBalls ? 'text-emerald-600' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900">Balls (set of 4)</p>
              <p className="text-xs text-gray-500">{ballLabel}</p>
            </div>
          </div>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              needsBalls ? 'bg-emerald-500' : 'bg-gray-300'
            } after:absolute after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform ${
              needsBalls ? 'after:translate-x-5' : ''
            }`}
          />
        </button>
      </div>

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
