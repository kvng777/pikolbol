'use client'

import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { CalendarPicker } from '@/components/booking/CalendarPicker'
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker'
import { BookingForm } from '@/components/booking/BookingForm'
import { BookingCard } from '@/components/booking/BookingCard'
import { useBookingsByDate, useDisabledSlotsByDate, useClosedDates } from '@/hooks/useBookings'
import { useCreateBooking } from '@/hooks/useCreateBooking'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'
import { BookingFormData, Booking } from '@/types/booking'
import { toast } from 'sonner'
import { Calendar, Clock, MapPin, Ban } from 'lucide-react'

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([])

  const dateString = format(selectedDate, 'yyyy-MM-dd')
  const { data: bookings = [], isLoading } = useBookingsByDate(dateString)
  const { data: disabledSlots = [] } = useDisabledSlotsByDate(dateString)
  const { data: closedDates = [] } = useClosedDates()
  const createBooking = useCreateBooking()

  const isDateClosed = useMemo(() => {
    return closedDates.some(cd => 
      dateString >= cd.start_date && dateString <= cd.end_date
    )
  }, [closedDates, dateString])

  const availableSlots = useMemo(() => {
    return getAvailableSlotsForCourt(bookings, dateString, 1, disabledSlots)
  }, [bookings, dateString, disabledSlots])

  useEffect(() => {
    setSelectedSlots([])
  }, [dateString])

  const handleSubmit = async (data: BookingFormData) => {
    const result = await createBooking.mutateAsync(data)

    if (result.success && result.booking) {
      setConfirmedBookings(prev => [...prev, result.booking!])
      toast.success('Booking confirmed!')
    } else {
      toast.error(result.error || 'Failed to create booking')
    }
  }

  const handleBookMultiple = async () => {
    for (const slot of selectedSlots) {
      await handleSubmit({
        name: '',
        phone: '',
        email: '',
        date: dateString,
        timeSlot: slot,
        courtNumber: 1,
      } as BookingFormData)
    }
  }

  const handleNewBooking = () => {
    setSelectedSlots([])
    setConfirmedBookings([])
  }

  if (confirmedBookings.length > 0) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <main className="relative z-10 min-h-screen flex items-center justify-center py-12 px-4">
          <div className="max-w-lg w-full space-y-4">
            <BookingCard bookings={confirmedBookings} />
            <div className="text-center mt-8">
              <button
                onClick={handleNewBooking}
                className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm font-medium"
              >
                Make another reservation
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <main className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <header className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-6 shadow-lg shadow-emerald-500/25">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
              Pikolbol
            </h1>
            <p className="text-lg text-gray-500 max-w-md mx-auto">
              Book your pickleball court in seconds
            </p>
          </header>

          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-emerald-100">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Select Date</h2>
                </div>
                <CalendarPicker
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                />
              </div>
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl min-h-[500px]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100">
                      <Clock className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Available Times
                    </h2>
                  </div>
                </div>
                
                <p className="text-sm text-gray-500 mb-5">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </p>

                {isDateClosed ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="p-4 rounded-full bg-red-100 mb-4">
                      <Ban className="w-8 h-8 text-red-500" />
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
                      onSubmit={handleSubmit}
                      isSubmitting={createBooking.isPending}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
