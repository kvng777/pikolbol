'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { CalendarPicker } from '@/components/booking/CalendarPicker'
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker'
import { BookingForm } from '@/components/booking/BookingForm'
import { BookingCard } from '@/components/booking/BookingCard'
import NavBar from '@/components/NavBar'
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
  const bookingCardRef = useRef<HTMLDivElement | null>(null)

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

  const handleNewBooking = () => {
    setSelectedSlots([])
    setConfirmedBookings([])
  }

  const handleDownloadScreenshot = async () => {
    if (!bookingCardRef.current) {
      toast.error('Nothing to capture')
      return
    }

    try {
      const domToImage = (await import('dom-to-image-more')).default

      // Clone the node and inline computed styles to avoid unsupported CSS (gradients/lab() colors)
      const original = bookingCardRef.current
      const clone = original.cloneNode(true) as HTMLElement

      const inlineStyles = (src: Element, dest: Element) => {
        const computed = window.getComputedStyle(src as HTMLElement)
        for (let i = 0; i < computed.length; i++) {
          const prop = computed[i]
          try {
            (dest as HTMLElement).style.setProperty(prop, computed.getPropertyValue(prop), computed.getPropertyPriority(prop))
          } catch {
            // ignore unsupported properties
          }
        }

        // Neutralize problematic display styles that often break rasterization
        ;(dest as HTMLElement).style.boxShadow = 'none'
        ;(dest as HTMLElement).style.backgroundImage = 'none'
        ;(dest as HTMLElement).style.filter = 'none'
        ;(dest as HTMLElement).style.backdropFilter = 'none'

        const srcChildren = Array.from(src.children)
        const destChildren = Array.from(dest.children)
        for (let i = 0; i < srcChildren.length; i++) {
          const s = srcChildren[i]
          const d = destChildren[i]
          if (s && d) inlineStyles(s, d)
        }
      }

      inlineStyles(original, clone)

      // Place offscreen and ensure size is preserved
      clone.style.position = 'fixed'
      clone.style.left = '-9999px'
      clone.style.top = '0'
      clone.style.zIndex = '9999'
      document.body.appendChild(clone)

      // Capture the cleaned clone
      const blob: Blob = await domToImage.toBlob(clone, { bgcolor: '#ffffff' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `booking-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      // remove the clone after capture
      clone.remove()
      toast.success('Screenshot downloaded')
    } catch (err) {
      console.error('Screenshot error', err)
      toast.error('Failed to capture screenshot')
    }
  }

  if (confirmedBookings.length > 0) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
        <main className="relative z-10 min-h-screen flex items-center justify-center py-12 px-4">
          <div className="max-w-lg w-full space-y-4">
            <div ref={bookingCardRef}>
              <BookingCard bookings={confirmedBookings} />
            </div>
            <div className="text-center mt-8">
              <button
                onClick={handleNewBooking}
                className="text-emerald-600 hover:text-emerald-700 transition-colors text-s font-medium"
              >
                Make another reservation
              </button>
              <button
                onClick={handleDownloadScreenshot}
                className="ml-4 text-emerald-600 hover:text-emerald-700 transition-colors text-s font-medium"
              >
                Download booking screenshot
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
      <NavBar />
      <main className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <header className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 mb-6 shadow-lg shadow-emerald-500/25">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
              Pikolbol
            </h1>
            <p className="text-lg text-gray-500 max-w-md mx-auto">
              Book your pickleball court in seconds
            </p>
          </header>

          <section id="about" className="mb-12">
            <h3 className="text-lg font-semibold text-gray-900">About</h3>
            <p className="text-sm text-gray-500">Pikolbol is a community-first pickleball court booking app.</p>
          </section>

          <section id="book" className="mb-12">
            <h3 className="text-lg font-semibold text-gray-900">Book</h3>
            <p className="text-sm text-gray-500 mb-6">Select a date and time to reserve a court.</p>
          </section>

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
                  closedDates={closedDates}
                />
              </div>
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl min-h-125">
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

          <section id="contact" className="mt-12">
            <h3 className="text-lg font-semibold text-gray-900">Contact</h3>
            <p className="text-sm text-gray-500">Questions? Email us at hello@pikolbol.example</p>
          </section>
        </div>
      </main>
    </div>
  )
}
