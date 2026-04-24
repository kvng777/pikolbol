'use client'

import React, { useState } from 'react'
import { CalendarPicker } from '@/components/booking/CalendarPicker'
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker'
import { BookingForm, BookingFormDefaultValues } from '@/components/booking/BookingForm'
import { AuthModal } from '@/components/auth/AuthModal'
import { BulkBookingPayload, TimeSlot, ClosedDate } from '@/types/booking'
import { useAuth } from '@/components/AuthProvider'
import { useProfile } from '@/hooks/useProfile'
import { LogIn } from 'lucide-react'

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
  onSubmit: (data: BulkBookingPayload) => Promise<void>
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
  const { user, loading: authLoading } = useAuth()
  const { data: profile } = useProfile()
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Prepare default values for the booking form from user profile
  const formDefaultValues: BookingFormDefaultValues | undefined = user ? {
    name: profile?.name || '',
    phone: profile?.phone || '',
    email: user.email || '',
  } : undefined

  const handleAuthSuccess = () => {
    // Auth modal will close automatically
    // The form will re-render with the new user data
  }

  const isAuthenticated = !!user

  return (
    <section id="book" style={{ scrollMarginTop: '5rem' }}>
      <h2 className="text-2xl font-semibold text-gray-900 mb-8 mt-8">Booking Form</h2>
      
      {/* Auth Modal */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        defaultTab="login"
      />

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
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl min-h-110">
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

            <p className="text-xl font-bold mb-5">
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
                
                {/* Show login prompt if not authenticated */}
                {!authLoading && !isAuthenticated ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-100">
                        <LogIn className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800">
                          Login required to book
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Please sign in or create an account to complete your booking.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAuthModal(true)}
                          className="mt-3 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-lg transition-all shadow-md shadow-emerald-500/25"
                        >
                          Sign In / Sign Up
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Show booking form if authenticated */}
                {isAuthenticated && (
                  <BookingForm
                    selectedDate={dateString}
                    selectedSlots={selectedSlots}
                    onSubmit={onSubmit}
                    isSubmitting={createBookingPending}
                    defaultValues={formDefaultValues}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
