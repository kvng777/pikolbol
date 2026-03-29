'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useUserAuth } from '@/hooks/useUserAuth'
import { supabase } from '@/lib/supabase'

type PageState = 'loading' | 'ready' | 'success' | 'error'

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [validationError, setValidationError] = useState('')
  
  const router = useRouter()
  const { isLoading, error, updatePassword } = useUserAuth()

  // Check if user has a valid session from the reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        setPageState('ready')
      } else {
        // Listen for auth state change (Supabase handles the token from URL)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY' && session) {
            setPageState('ready')
          } else if (event === 'SIGNED_IN' && session) {
            setPageState('ready')
          }
        })

        // Give it a moment to process the URL token
        setTimeout(() => {
          if (pageState === 'loading') {
            setPageState('error')
          }
        }, 3000)

        return () => subscription.unsubscribe()
      }
    }

    checkSession()
  }, [pageState])

  const validatePassword = (): boolean => {
    setValidationError('')

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters')
      return false
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validatePassword()) return

    const success = await updatePassword(password)
    if (success) {
      setPageState('success')
    }
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <PageContainer>
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <p className="text-gray-600">Verifying your reset link...</p>
        </div>
      </PageContainer>
    )
  }

  // Error state - invalid or expired link
  if (pageState === 'error') {
    return (
      <PageContainer>
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Invalid or Expired Link</h2>
          <p className="text-sm text-gray-600">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link href="/">
            <Button className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              Back to Home
            </Button>
          </Link>
        </div>
      </PageContainer>
    )
  }

  // Success state
  if (pageState === 'success') {
    return (
      <PageContainer>
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mx-auto">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Password Updated!</h2>
          <p className="text-sm text-gray-600">
            Your password has been successfully updated. You can now sign in with your new password.
          </p>
          <Button 
            onClick={() => router.push('/')}
            className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
          >
            Go to Home
          </Button>
        </div>
      </PageContainer>
    )
  }

  // Ready state - show password reset form
  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">Set New Password</h2>
          <p className="text-sm text-gray-600 mt-1">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                required
                disabled={isLoading}
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 pr-10 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                required
                disabled={isLoading}
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {(validationError || error) && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600 text-center">{validationError || error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition-all"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Updating...
              </span>
            ) : (
              'Update Password'
            )}
          </Button>
        </form>

        <Link 
          href="/"
          className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </PageContainer>
  )
}

// Shared page container component
function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/logo-color.png" alt="Pikolbol logo" width={40} height={40} className="object-contain" />
            <span className="text-xl font-semibold text-gray-900">Pikolbol Gapan</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
