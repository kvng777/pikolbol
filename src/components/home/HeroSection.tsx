'use client'

import Image from "next/image"
import { ChevronDown } from 'lucide-react'

export default function HeroSection({
  // title = 'Pikolbol',
  subtitle = 'Book your pickleball court in seconds',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <header className="text-center mb-12">
      {/* full-bleed wrapper so hero spans edge-to-edge even when inside a centered container */}
      <div className="relative w-screen left-1/2 -translate-x-1/2" style={{ paddingTop: '56.25%' }}>
        {/* background video (16:9) */}
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/hero-banner-vid.mp4"
          autoPlay
          loop
          muted
          playsInline
        />

        {/* dark overlay to improve text contrast */}
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

        {/* logo + content overlay (clickable to scroll to booking) */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Scroll to booking section"
          onClick={() => {
            const el = document.getElementById('book')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              const el = document.getElementById('book')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }}
        >
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full mb-6 shadow-lg shadow-emerald-500/25 bg-white/40">
            <Image src="/logo-color.png" alt="Pikolbol logo" width={128} height={128} className="object-contain" />
          </div>
          {/* optional title if you want to enable later */}
          {/* <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">Pikolbol</h1> */}
          <p className="text-2xl text-white max-w-md mx-auto">{subtitle}</p>
          <ChevronDown className="w-8 h-8 mt-6 text-white animate-bounce" />
        </div>
      </div>
    </header>
  )
}
