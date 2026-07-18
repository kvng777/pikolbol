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
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Hours</p>
            <p className="text-sm text-gray-900">Open daily: 5:00 AM — 12:00AM(mid night)</p>
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

        <a
          href="https://www.google.com/maps/place/?q=place_id:ChIJvdAjYwAhlzMRJcBJ0tczABQ"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-sm hover:border-emerald-300 hover:shadow-md transition"
        >
          <div className="p-2 rounded-md bg-emerald-50 text-emerald-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Location</p>
            <p className="text-sm underline text-emerald-600">No.051 Sitio Garcia St, Sto. Cristo Norte, Gapan <span className="text-gray-400">(In front of Casa Granja)</span></p>
          </div>
        </a>

        <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 shadow-sm">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3848.5729342984496!2d120.95828237551655!3d15.29106815979874!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x339721006323d0bd%3A0x140033d7d249c025!2sPIKOLBOL%20GAPAN!5e0!3m2!1sen!2s!4v1784350642573!5m2!1sen!2s"
            title="PIKOLBOL Gapan location on Google Maps"
            width="100%"
            height="320"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </section>
  )
}
