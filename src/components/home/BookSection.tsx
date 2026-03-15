'use client'

import React from 'react'
import { CalendarPicker } from '@/components/booking/CalendarPicker'
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker'
import { BookingForm } from '@/components/booking/BookingForm'
import { BookingFormData, TimeSlot, ClosedDate } from '@/types/booking'

type BookSectionProps = {
  selectedDate: Date
  selectedSlots: string[]
  setSelectedDate: (d: Date) => void
  setSelectedSlots: (s: string[]) => void
  isDateClosed: boolean
  availableSlots: TimeSlot[]
  isLoading: boolean
  dateString: string
  createBookingPending: boolean
  onSubmit: (data: BookingFormData) => Promise<void>
  closedDates: ClosedDate[]
}

export default function BookSection({
  selectedDate,
  selectedSlots,
  setSelectedDate,
  setSelectedSlots,
  isDateClosed,
  availableSlots,
  isLoading,
  dateString,
  createBookingPending,
  onSubmit,
  closedDates,
}: BookSectionProps) {
  return (
    <>
      <section id="book" className="mb-12">
        <h3 className="text-lg font-semibold text-gray-900">Book</h3>
        <p className="text-sm text-gray-500 mb-6">Select a date and time to reserve a court.</p>
      </section>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-emerald-100">
                <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8h18M3 16h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Select Date</h2>
            </div>
            <CalendarPicker
              selected={selectedDate}
              onSelect={setSelectedDate}
              closedDates={closedDates}
            />
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl min-h-125">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8h18M3 16h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Available Times
                </h2>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-5">
              {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {isDateClosed ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-red-100 mb-4">
                  <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="text-gray-900 font-medium">Court is closed</p>
                <p className="text-sm text-gray-500 mt-1">Please select a different date</p>
              </div>
            ) : (
              <TimeSlotPicker
                slots={availableSlots}
                selectedSlots={selectedSlots}
                onSelectSlots={setSelectedSlots}
                isLoading={isLoading}
              />
            )}

            {selectedSlots.length > 0 && !isDateClosed && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="text-gray-900 font-semibold mb-4">Complete your booking</h3>
                <BookingForm
                  selectedDate={dateString}
                  selectedSlots={selectedSlots}
                  onSubmit={onSubmit}
                  isSubmitting={createBookingPending}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
