'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { AuthModal } from '@/components/auth/AuthModal'
import { User, LogOut, CalendarDays, ChevronDown, Menu, X } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'

// ============================================================================
// Constants
// ============================================================================

const SECTIONS = [
  { id: 'rates', label: 'Rates & Policies' },
  { id: 'book', label: 'Book' },
  { id: 'contact', label: 'Contact' },
]

// ============================================================================
// Sub-components
// ============================================================================

interface NavLinkProps {
  id: string
  label: string
  isActive: boolean
  onClick: (id: string) => (e: React.MouseEvent) => void
  className?: string
}

function NavLink({ id, label, isActive, onClick, className = '' }: NavLinkProps) {
  const baseStyles = 'text-sm transition-colors'
  const activeStyles = isActive ? 'text-emerald-600 font-medium' : 'text-gray-600 hover:text-gray-900'
  
  return (
    <a
      href={`#${id}`}
      onClick={onClick(id)}
      className={`${baseStyles} ${activeStyles} ${className}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </a>
  )
}

interface MobileNavLinkProps extends NavLinkProps {
  onNavigate: () => void
}

function MobileNavLink({ id, label, isActive, onClick, onNavigate }: MobileNavLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    onClick(id)(e)
    onNavigate()
  }
  
  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      className={`block px-4 py-3 text-base transition-colors rounded-lg ${
        isActive 
          ? 'text-emerald-600 font-medium bg-emerald-50' 
          : 'text-gray-700 hover:bg-gray-50'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </a>
  )
}

interface UserAvatarProps {
  displayName: string
  size?: 'sm' | 'md'
}

function UserAvatar({ displayName, size = 'sm' }: UserAvatarProps) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'
  
  return (
    <div className={`${sizeClasses} rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-medium`}>
      {displayName?.[0]?.toUpperCase() || 'U'}
    </div>
  )
}

interface UserMenuDropdownProps {
  displayName: string
  onSignOut: () => void
  onClose: () => void
}

function UserMenuDropdown({ displayName, onSignOut, onClose }: UserMenuDropdownProps) {
  return (
    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900 truncate">
          {displayName}
        </p>
      </div>

      <Link
        href="/profile"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <User className="w-4 h-4 text-gray-400" />
        My Profile
      </Link>

      <Link
        href="/profile"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-gray-400" />
        My Bookings
      </Link>

      <div className="border-t border-gray-100 mt-1">
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )
}

interface MobileMenuProps {
  isOpen: boolean
  sections: typeof SECTIONS
  activeSection: string
  onSectionClick: (id: string) => (e: React.MouseEvent) => void
  onClose: () => void
  user: ReturnType<typeof useAuth>['user']
  userIsAdmin: boolean
  displayName: string
  onSignOut: () => void
  onSignIn: () => void
}

function MobileMenu({ 
  isOpen, 
  sections, 
  activeSection, 
  onSectionClick, 
  onClose,
  user,
  userIsAdmin,
  displayName,
  onSignOut,
  onSignIn,
}: MobileMenuProps) {
  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Menu panel */}
      <div className="fixed top-16 right-0 left-0 bg-white border-b border-gray-200 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
        <nav className="px-4 py-4 space-y-1">
          {/* Section links */}
          {sections.map((s) => (
            <MobileNavLink
              key={s.id}
              id={s.id}
              label={s.label}
              isActive={activeSection === s.id}
              onClick={onSectionClick}
              onNavigate={onClose}
            />
          ))}

          {/* Admin Dashboard link */}
          {user && userIsAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="block px-4 py-3 text-base text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Admin Dashboard
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-100 px-4 py-4">
          {user ? (
            <div className="space-y-3">
              {/* User info */}
              <div className="flex items-center gap-3 px-4 py-2">
                <UserAvatar displayName={displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {displayName}
                  </p>
                </div>
              </div>

              {/* User actions */}
              <Link
                href="/profile"
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 text-base text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <User className="w-5 h-5 text-gray-400" />
                My Profile
              </Link>

              <Link
                href="/profile"
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 text-base text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <CalendarDays className="w-5 h-5 text-gray-400" />
                My Bookings
              </Link>

              <button
                type="button"
                onClick={() => {
                  onSignOut()
                  onClose()
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-base text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSignIn()
                onClose()
              }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-base font-medium shadow-md shadow-emerald-500/25 transition-all"
            >
              <User className="w-5 h-5" />
              Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function NavBar() {
  const [active, setActive] = useState<string>('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, signOut, isAdmin: userIsAdmin } = useAuth()
  const { data: profile } = useProfile()
  
  const displayName = profile?.name ?? user?.user_metadata?.full_name ?? user?.email ?? 'User'
  const isAdminPath = pathname?.startsWith('/admin') ?? false
  const isProfilePage = pathname === '/profile'
  const showSectionLinks = !isAdminPath && !isProfilePage

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false)
  }, [pathname])

  // Intersection observer for active section tracking
  useEffect(() => {
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

  const handleSectionClick = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
    setShowMobileMenu(false)
    router.push('/')
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
  }

  const toggleMobileMenu = () => {
    setShowMobileMenu(prev => !prev)
    setShowUserMenu(false)
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
              <Image src="/logo-color.png" alt="Pikolbol logo" width={32} height={32} className="object-contain" />
              <span className="font-semibold text-gray-900">Pikolbol Gapan</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-4">
              {/* Section links (only on main page) */}
              {showSectionLinks && (
                <ul className="flex items-center gap-6">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <NavLink
                        id={s.id}
                        label={s.label}
                        isActive={active === s.id}
                        onClick={handleSectionClick}
                      />
                    </li>
                  ))}

                  {/* Admin Dashboard link - only for authenticated admins */}
                  {user && userIsAdmin && (
                    <li>
                      <Link
                        href="/admin"
                        className="text-sm transition-colors text-gray-600 hover:text-gray-900"
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
                  onClick={() => {
                    const win = window.open('/', '_blank')
                    if (win) win.opener = null
                  }}
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
                    <div className="relative" ref={userMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <UserAvatar displayName={displayName} />
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                      </button>

                      {showUserMenu && (
                        <UserMenuDropdown
                          displayName={displayName}
                          onSignOut={handleSignOut}
                          onClose={() => setShowUserMenu(false)}
                        />
                      )}
                    </div>
                  ) : (
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

            {/* Mobile Menu Button */}
            {!isAdminPath && (
              <button
                type="button"
                onClick={toggleMobileMenu}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                aria-expanded={showMobileMenu}
                aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              >
                {showMobileMenu ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            )}

            {/* Admin mobile: Switch to customer view */}
            {isAdminPath && (
              <button
                type="button"
                onClick={() => {
                  const win = window.open('/', '_blank')
                  if (win) win.opener = null
                }}
                className="md:hidden inline-flex items-center px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md text-sm font-medium"
              >
                Customer view
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {showSectionLinks && (
        <MobileMenu
          isOpen={showMobileMenu}
          sections={SECTIONS}
          activeSection={active}
          onSectionClick={handleSectionClick}
          onClose={() => setShowMobileMenu(false)}
          user={user}
          userIsAdmin={userIsAdmin}
          displayName={displayName}
          onSignOut={handleSignOut}
          onSignIn={() => setShowAuthModal(true)}
        />
      )}

      {/* Spacer to prevent content being hidden under the fixed navbar */}
      <div className="h-16" aria-hidden="true" />
    </>
  )
}
