import React from 'react'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-12 border-t border-gray-100 bg-white/60 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>© {year} Rolando Gamboa. All rights reserved.</div>
          <div>
            <span className="hidden sm:inline">Built with care.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
