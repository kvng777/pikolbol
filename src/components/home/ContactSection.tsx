'use client'

import React from 'react'
import { MapPin, Clock, Phone, Mail } from 'lucide-react'

export default function ContactSection() {
  return (
    <section id="contact" className="mt-12">
      <h3 className="text-lg font-semibold text-gray-900">Contact</h3>
      <p className="text-sm text-gray-500 mb-6">
        We&apos;re here to help and answer any inquiries you may have about our facilities, bookings, or anything else you need to know.
      </p>

      <div className="grid gap-3 sm:grid-cols-1">
        <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
          <div className="p-2 rounded-md bg-emerald-50 text-emerald-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Location</p>
            <p className="text-sm text-gray-900">No.051 Sitio Garcia St, Sto. Cristo Norte, Gapan <span className="text-gray-400">(In front of Casa Granja)</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
          <div className="p-2 rounded-md bg-emerald-50 text-emerald-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Hours</p>
            <p className="text-sm text-gray-900">Open daily: 6:00 AM — 10:00 PM</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
          <div className="p-2 rounded-md bg-emerald-50 text-emerald-600">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="text-sm text-gray-900">R. Gamboa — <a href="tel:+639064514819" className="text-emerald-600 hover:underline">0906 451 4819</a></p>
          </div>
        </div>

      </div>
    </section>
  )
}
