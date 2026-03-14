'use client'

import React, { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'book', label: 'Book' },
  { id: 'contact', label: 'Contact' },
]

export default function NavBar() {
  const [active, setActive] = useState<string>('about')

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActive(entry.target.id)
        }
      })
    }

    const opts = { root: null, rootMargin: '0px', threshold: 0.6 }

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (!el) return
      const obs = new IntersectionObserver(handleIntersect, opts)
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [])

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // update active immediately for perceived responsiveness
    setActive(id)
  }

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/60 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-100">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="font-semibold text-gray-900">Pikolbol</span>
          </div>

          <div>
            <ul className="flex items-center gap-6">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={handleClick(s.id)}
                    className={`text-sm transition-colors ${active === s.id ? 'text-emerald-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                    aria-current={active === s.id ? 'page' : undefined}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  )
}
