'use client'

import Image from "next/image"

export default function HeroSection({
  // title = 'Pikolbol',
  // subtitle = 'Book your pickleball court in seconds',
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
        <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

        {/* logo + content overlay (clickable to scroll to booking) */}
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div
            className="w-full max-w-5xl mx-auto flex  flex-col sm:flex-row items-center md:gap-8 gap:4 md:items-stretch"
            role="group"
            aria-label="Hero content"
          >
            {/* logo column */}
            <div
              className="items-center justify-center md:justify-start cursor-pointer"
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
              tabIndex={0}
            >
              <div
                className="hidden sm:inline-flex items-center justify-center sm:w-24 sm:h-24 md:w-36 md:h-36 rounded-full mb-2"
                aria-hidden="true"
              >
                <Image src="/logo-color.png" alt="Pikolbol logo" width={144} height={144} className="object-contain" />
              </div>
            </div>
            <div className="text-white  text-left ">
              <h1 className="text-md  md:text-3xl">
                Enjoy the fresh air and peaceful surroundings while playing your favorite game. Perfect for friends, families, and pickleball lovers of all levels!
              </h1>
              <h2 className="mt-4 text-sm md:text-lg">
                Grab your paddle, bring your friends, and let&apos;s rally! See you on the court!
              </h2>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
