'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, CalendarCheck, KeyRound } from 'lucide-react'
import { LoginForm } from '@/components/admin/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { useUserAuth } from '@/hooks/useUserAuth'

type AuthTab = 'login' | 'signup' | 'forgot-password'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  defaultTab?: AuthTab
}

export function AuthModal({ open, onClose, onSuccess, defaultTab = 'login' }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>(defaultTab)
  const { isLoading, error, successMessage, login, signup, resetPassword, clearError, clearSuccess } = useUserAuth()
  const isClient = typeof document !== 'undefined'

  // Reset tab when modal opens
  // useEffect(() => {
  //   if (open) {
  //     setActiveTab(defaultTab)
  //     clearError()
  //   }
  // }, [open, defaultTab, clearError])

  // Handle escape key
  useEffect(() => {
    if (!open || !isClient) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, isClient])

  const handleLogin = async (credentials: { email: string; password: string }) => {
    const success = await login(credentials)
    if (success) {
      onSuccess()
      onClose()
    }
  }

  const handleSignup = async (credentials: { email: string; password: string; name: string; phone: string }) => {
    const success = await signup(credentials)
    // Don't close modal - let SignupForm show success state with email verification message
    return success
  }

  const handleTabChange = (tab: AuthTab) => {
    setActiveTab(tab)
    clearError()
    clearSuccess()
  }

  const handleForgotPassword = async (email: string) => {
    return await resetPassword(email)
  }

  if (!open || !isClient) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal content */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-3 shadow-lg shadow-emerald-500/25">
            {activeTab === 'forgot-password' ? (
              <KeyRound className="w-6 h-6 text-white" />
            ) : (
              <CalendarCheck className="w-6 h-6 text-white" />
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {activeTab === 'login' && 'Welcome Back'}
            {activeTab === 'signup' && 'Create Account'}
            {activeTab === 'forgot-password' && 'Reset Password'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === 'login' && 'Sign in to book your court'}
            {activeTab === 'signup' && 'Sign up to start booking courts'}
            {activeTab === 'forgot-password' && 'Enter your email to receive a reset link'}
          </p>
        </div>

        {/* Tabs - hide when in forgot password view */}
        {activeTab !== 'forgot-password' && (
          <div className="px-6">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'login'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('signup')}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'signup'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign Up
              </button>
            </div>
          </div>
        )}

        {/* Form content */}
        <div className="p-6">
          {activeTab === 'login' && (
            <LoginForm
              onSubmit={handleLogin}
              onForgotPassword={() => handleTabChange('forgot-password')}
              isLoading={isLoading}
              error={error}
            />
          )}
          {activeTab === 'signup' && (
            <SignupForm
              onSubmit={handleSignup}
              onBackToLogin={() => handleTabChange('login')}
              isLoading={isLoading}
              error={error}
            />
          )}
          {activeTab === 'forgot-password' && (
            <ForgotPasswordForm
              onSubmit={handleForgotPassword}
              onBack={() => handleTabChange('login')}
              isLoading={isLoading}
              error={error}
              successMessage={successMessage}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <p className="text-xs text-gray-400">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
