'use client'

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Booking } from '@/types/booking'
import { format } from 'date-fns'
import { CheckCircle2, Calendar, Clock, User, Phone, Mail, CreditCard, X } from 'lucide-react'
import { calculatePaymentAmount } from '@/lib/paymentConfig'

type Props = {
  open: boolean
  onClose: () => void
  bookings: Booking[]
  bookingCardRef: React.RefObject<HTMLDivElement | null>
  onDownload: () => void | Promise<void>
}

export default function BookingConfirmedModal({ open, onClose, bookings, bookingCardRef, onDownload }: Props) {
  const isClient = typeof document !== 'undefined'

  useEffect(() => {
    if (!open || !isClient) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, isClient])

  if (!open || !isClient) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-lg mx-auto" role="dialog" aria-modal="true" aria-labelledby="booking-confirmed-title">

          <div className="max-w-lg w-full space-y-4">
            {/* Inlined BookingCard content so modal contains everything to screenshot */}
            <div ref={bookingCardRef}>
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-2xl blur-xl opacity-30" />
                <div className="relative bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden">
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/25">
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                    <h2 id="booking-confirmed-title" className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
                    <p className="text-gray-500 mt-1">
                      Please keep this confirmation for your reference. We look forward to seeing you on the court!
                    </p>
                  </div>

                  <div className="p-8">
                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-gray-900 font-semibold text-lg">{bookings[0]?.name}</p>
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <Mail className="w-3 h-3" />
                          {bookings[0]?.email}
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <Phone className="w-3 h-3" />
                          {bookings[0]?.phone}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="p-2 rounded-lg bg-emerald-100">
                          <User className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Players</p>
                          <p className="text-gray-900 font-medium">{bookings[0]?.players}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="p-2 rounded-lg bg-emerald-100">
                          <Calendar className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Date</p>
                          <p className="text-gray-900 font-medium">{format(new Date(bookings[0]?.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="p-2 rounded-lg bg-emerald-100">
                          <Clock className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-1">
                            {bookings.length === 1 ? 'Time' : `Time Slots (${bookings.length})`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {bookings.map((b) => (
                              <span key={b.time_slot} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">{b.time_slot}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="p-2 rounded-lg bg-emerald-100">
                          <CreditCard className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-gray-900 font-medium">
                            {(() => {
                              const timeSlots = bookings.map(b => b.time_slot)
                              const players = bookings[0]?.players ?? 1
                              const totalCost = calculatePaymentAmount(timeSlots, players)
                              return `Php${totalCost.toLocaleString()}`
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <button
                      onClick={onDownload}
                      className="text-emerald-600 hover:text-emerald-700 transition-colors text-s font-medium mb-3"
                    >
                      Download screenshot
                    </button>
                    <p>Or take a screenshot manually</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>,
    document.body
  )
}
