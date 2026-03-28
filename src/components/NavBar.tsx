'use client'

import React, { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { AuthModal } from '@/components/auth/AuthModal'
import { User, LogOut, CalendarDays, ChevronDown } from 'lucide-react'

const SECTIONS = [
  // { id: 'about', label: 'About' },
  { id: 'rates', label: 'Rates & Policies' },
  { id: 'book', label: 'Book' },
  { id: 'contact', label: 'Contact' },
]

export default function NavBar() {
  const [active, setActive] = useState<string>('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, signOut, isAdmin: userIsAdmin } = useAuth()
  
  const isAdminPath = pathname?.startsWith('/admin') ?? false
  const isProfilePage = pathname === '/profile'

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // Only observe sections on the main page
    if (isAdminPath || isProfilePage) return

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
  }, [isAdminPath, isProfilePage])

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
    router.push('/')
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
  }

  return (
    <>
      {/* Auth Modal */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        defaultTab="login"
      />

      <nav className="fixed top-0 left-0 z-50 w-full bg-white/60 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="p-1 rounded-md bg-emerald-50">
                <Image src="/logo-bw.png" alt="Pikolbol logo" width={32} height={32} className="object-contain" />
              </div>
              <span className="font-semibold text-gray-900">Pikolbol Gapan</span>
            </Link>

            <div className="flex items-center gap-4">
              {/* Section links (only on main page) */}
              {!isAdminPath && !isProfilePage && (
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

                  {/* Admin Dashboard link - only for authenticated admins */}
                  {user && userIsAdmin && (
                    <li>
                      <Link
                        href="/admin"
                        className={`text-sm transition-colors text-gray-600 hover:text-gray-900`}
                      >
                        Admin Dashboard
                      </Link>
                    </li>
                  )}
                </ul>
              )}

              {/* Admin: Switch to customer view */}
              {isAdminPath && (
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="inline-flex items-center px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md text-sm font-medium"
                >
                  Switch to customer view
                </button>
              )}

              {/* User menu or login button */}
              {!isAdminPath && (
                <>
                  {authLoading ? (
                    <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                  ) : user ? (
                    // Logged in: Show user menu
                    <div className="relative" ref={userMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                          {user.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown menu */}
                      {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                          <div className="px-4 py-2 border-b border-gray-100">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.email}
                            </p>
                          </div>

                          <Link
                            href="/profile"
                            onClick={() => setShowUserMenu(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <User className="w-4 h-4 text-gray-400" />
                            My Profile
                          </Link>

                          <Link
                            href="/profile"
                            onClick={() => setShowUserMenu(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <CalendarDays className="w-4 h-4 text-gray-400" />
                            My Bookings
                          </Link>

                          <div className="border-t border-gray-100 mt-1">
                            <button
                              type="button"
                              onClick={handleSignOut}
                              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                              Sign Out
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Not logged in: Show login button
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-sm font-medium shadow-md shadow-emerald-500/25 transition-all"
                    >
                      <User className="w-4 h-4" />
                      Sign In
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      {/* spacer to prevent content being hidden under the fixed navbar */}
      <div className="h-16" aria-hidden="true" />
    </>
  )
}
