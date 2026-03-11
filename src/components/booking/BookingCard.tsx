'use client'

import { Booking } from '@/types/booking'
import { format } from 'date-fns'
import { CheckCircle2, Calendar, Clock, MapPin, User, Phone, Mail } from 'lucide-react'

interface BookingCardProps {
  booking: Booking
}

export function BookingCard({ booking }: BookingCardProps) {
  const formattedDate = format(new Date(booking.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')

  return (
    <div className="relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-2xl blur-xl opacity-30" />
      <div className="relative bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/25">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
          <p className="text-gray-500 mt-1">Your reservation has been saved</p>
        </div>

        <div className="p-8">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-gray-900 font-semibold text-lg">{booking.name}</p>
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Mail className="w-3 h-3" />
                {booking.email}
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Phone className="w-3 h-3" />
                {booking.phone}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-gray-900 font-medium">{formattedDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Time</p>
                <p className="text-gray-900 font-medium">{booking.time_slot}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
              <div className="p-2 rounded-lg bg-emerald-100">
                <MapPin className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Court</p>
                <p className="text-gray-900 font-medium">Court {booking.court_number}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
