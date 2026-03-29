'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import NavBar from '@/components/NavBar'
import HeroSection from '@/components/home/HeroSection'
import BookSection from '@/components/home/BookSection'
import ContactSection from '@/components/home/ContactSection'
import Footer from '@/components/home/Footer'
import { useActiveBookingsByDate, useDisabledSlotsByDate, useClosedDates } from '@/hooks/useBookings'
import { getAvailableSlotsForCourt } from '@/lib/timeSlotGenerator'
import { Booking, BulkBookingPayload } from '@/types/booking'
import { toast } from 'sonner'
import BookingConfirmedModal from '@/components/ui/BookingConfirmedModal'
import { PaymentScreen, BookingData } from '@/components/booking/PaymentScreen'
import { useAuth } from '@/components/AuthProvider'
import { calculatePaymentAmount } from '@/lib/paymentConfig'
import RatesPolicies from '@/components/home/RatesPolicies'

type BookingState = 'idle' | 'payment' | 'pending' | 'confirmed'

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [bookingState, setBookingState] = useState<BookingState>('idle')
  const [pendingBookingData, setPendingBookingData] = useState<BookingData | null>(null)
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([])
  const bookingCardRef = useRef<HTMLDivElement | null>(null)

  const { user } = useAuth()
  const dateString = format(selectedDate, 'yyyy-MM-dd')
  
  // Use ACTIVE bookings for slot availability (pending + confirmed)
  const { data: bookings = [], isLoading, refetch } = useActiveBookingsByDate(dateString)
  const { data: disabledSlots = [] } = useDisabledSlotsByDate(dateString)
  const { data: closedDates = [] } = useClosedDates()

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

  // When user clicks "Book" button - just open payment screen
  const handleSubmit = async (data: BulkBookingPayload) => {
    const bookingData: BookingData = {
      name: data.name,
      phone: data.phone,
      email: data.email,
      date: data.date || dateString,
      timeSlots: data.timeSlots || selectedSlots,
      courtNumber: data.courtNumber || 1,
      players: data.players || 2,
      user_id: user?.id,
    }

    setPendingBookingData(bookingData)
    setBookingState('payment')
  }

  // When user submits payment
  const handlePaymentSubmitted = useCallback((bookings: Booking[]) => {
    setConfirmedBookings(bookings)
    setBookingState('pending')
    // Clear pending booking data and selected slots immediately so the booking UI reflects the new state
    setPendingBookingData(null)
    setSelectedSlots([])
    refetch() // Refresh available slots
  }, [refetch])

  // When admin confirms payment
  const handlePaymentConfirmed = useCallback(() => {
    setPendingBookingData(null)
    setBookingState('confirmed')
    setSelectedSlots([])
    toast.success('Payment confirmed! Your booking is secured.')
  }, [])

  // When user cancels payment modal
  const handleCancelPayment = useCallback(() => {
    setPendingBookingData(null)
    setBookingState('idle')
    // No need to clear slots - they weren't booked yet
  }, [])

  const handleNewBooking = () => {
    setSelectedSlots([])
    setConfirmedBookings([])
    setPendingBookingData(null)
    setBookingState('idle')
  }

  const handleDownloadScreenshot = async () => {
    if (!bookingCardRef.current) {
      toast.error('Nothing to capture')
      return
    }

    try {
      const domToImage = (await import('dom-to-image-more')).default

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

      clone.style.position = 'fixed'
      clone.style.left = '-9999px'
      clone.style.top = '0'
      clone.style.zIndex = '9999'
      document.body.appendChild(clone)

      const blob: Blob = await domToImage.toBlob(clone, { bgcolor: '#ffffff' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `booking-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      clone.remove()
      toast.success('Screenshot downloaded')
    } catch (err) {
      console.error('Screenshot error', err)
      toast.error('Failed to capture screenshot')
    }
  }

  // Calculate payment amount
  const paymentAmount = pendingBookingData 
    ? calculatePaymentAmount(pendingBookingData.timeSlots, pendingBookingData.players)
    : 0

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-emerald-50 via-white to-teal-50">
      <NavBar />
      
      {/* Payment Screen - only shows when user clicks "Book" */}
      {bookingState === 'payment' && pendingBookingData && (
        <PaymentScreen
          bookingData={pendingBookingData}
          amount={paymentAmount}
          onPaymentSubmitted={handlePaymentSubmitted}
          onPaymentConfirmed={handlePaymentConfirmed}
          onCancel={handleCancelPayment}
        />
      )}

      {/* Booking Confirmed Modal */}
      <BookingConfirmedModal
        open={bookingState === 'confirmed' && confirmedBookings.length > 0}
        onClose={handleNewBooking}
        bookings={confirmedBookings}
        bookingCardRef={bookingCardRef}
        onDownload={handleDownloadScreenshot}
      />

      <main className="relative z-10 min-h-screen py-12 pt-0 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <HeroSection />
          <RatesPolicies />
          <BookSection
            selectedDate={selectedDate}
            selectedSlots={selectedSlots}
            setSelectedDate={setSelectedDate}
            setSelectedSlots={setSelectedSlots}
            isDateClosed={isDateClosed}
            availableSlots={availableSlots}
            isLoading={isLoading}
            dateString={dateString}
            createBookingPending={false}
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
