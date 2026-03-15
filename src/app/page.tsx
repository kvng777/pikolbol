'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import NavBar from '@/components/NavBar'
import HeroSection from '@/components/home/HeroSection'
// import AboutSection from '@/components/home/AboutSection'
import BookSection from '@/components/home/BookSection'
import ContactSection from '@/components/home/ContactSection'
import Footer from '@/components/home/Footer'
import { useBookingsByDate, useDisabledSlotsByDate, useClosedDates } from '@/hooks/useBookings'
import { useCreateBooking, useCreateBookings } from '@/hooks/useCreateBooking'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'
import { Booking, BulkBookingPayload } from '@/types/booking'
import { toast } from 'sonner'
import BookingConfirmedModal from '@/components/ui/BookingConfirmedModal'

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
  const createBookings = useCreateBookings()

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

  const handleSubmit = async (data: BulkBookingPayload) => {
    try {
      const payload: BulkBookingPayload = data

      // ensure date and court are consistent with page state if booking form didn't provide them
      if (!payload.date) payload.date = dateString
      if (!payload.courtNumber) payload.courtNumber = 1
      if (!payload.timeSlots || payload.timeSlots.length === 0) payload.timeSlots = selectedSlots

      const result = await createBookings.mutateAsync(payload)

      if (result.success && result.bookings) {
        setConfirmedBookings(result.bookings)
        toast.success('Booking confirmed!')
      } else {
        toast.error(result.error || 'Failed to create bookings')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to create bookings')
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

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
      <NavBar />
      <BookingConfirmedModal
        open={confirmedBookings.length > 0}
        onClose={handleNewBooking}
        bookings={confirmedBookings}
        bookingCardRef={bookingCardRef}
        onDownload={handleDownloadScreenshot}
      />

      <main className="relative z-10 min-h-screen py-12 pt-0 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <HeroSection />

          {/* <AboutSection /> */}

          <BookSection
            selectedDate={selectedDate}
            selectedSlots={selectedSlots}
            setSelectedDate={setSelectedDate}
            setSelectedSlots={setSelectedSlots}
            isDateClosed={isDateClosed}
            availableSlots={availableSlots}
            isLoading={isLoading}
            dateString={dateString}
            createBookingPending={createBooking.isPending}
            onSubmit={handleSubmit}
            closedDates={closedDates}
          />

          <ContactSection />
          
        </div>
      </main>
      <Footer />
    </div>
  )
}
