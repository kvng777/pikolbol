'use client'

import Image from "next/image"

export default function HeroSection({
  // title = 'Pikolbol',
  subtitle = 'Book your pickleball court in seconds',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <header className="text-center mb-12">
      <div className="inline-flex items-center justify-center w-32 h-32 rounded-full mb-6 shadow-lg shadow-emerald-500/25">
        <Image src="/logo-color.png" alt="Pikolbol logo" width={200} height={200} className="object-contain" />
      </div>
      {/* <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">{title}</h1> */}
      <p className="text-lg text-gray-500 max-w-md mx-auto">{subtitle}</p>
    </header>
  )
}
