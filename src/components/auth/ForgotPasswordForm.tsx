'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<boolean>
  onBack: () => void
  isLoading: boolean
  error: string
  successMessage: string
}

export function ForgotPasswordForm({ 
  onSubmit, 
  onBack, 
  isLoading, 
  error, 
  successMessage 
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await onSubmit(email)
    if (success) {
      setSubmitted(true)
    }
  }

  // Success state - email sent
  if (submitted && successMessage) {
    return (
      <div className="space-y-5 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mx-auto">
          <CheckCircle className="w-6 h-6 text-emerald-600" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">Check your email</h3>
          <p className="text-sm text-gray-600">
            We sent a password reset link to <span className="font-medium">{email}</span>
          </p>
        </div>

        <p className="text-xs text-gray-500">
          Didn&apos;t receive the email? Check your spam folder or try again.
        </p>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSubmitted(false)
            setEmail('')
          }}
          className="w-full h-12"
        >
          Try another email
        </Button>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reset-email" className="text-sm font-medium text-gray-700">
          Email address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="reset-email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10 h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
            required
            disabled={isLoading}
            autoFocus
          />
        </div>
        <p className="text-xs text-gray-500">
          We&apos;ll send you a link to reset your password.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600 text-center">{error}</p>
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
            Sending...
          </span>
        ) : (
          'Send reset link'
        )}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="w-full inline-flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </button>
    </form>
  )
}
