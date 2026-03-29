'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LoginCredentials {
  email: string
  password: string
}

interface SignupCredentials {
  email: string
  password: string
  name: string
  phone: string
}

interface UseUserAuthReturn {
  isLoading: boolean
  error: string
  successMessage: string
  login: (credentials: LoginCredentials) => Promise<boolean>
  signup: (credentials: SignupCredentials) => Promise<boolean>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<boolean>
  updatePassword: (newPassword: string) => Promise<boolean>
  clearError: () => void
  clearSuccess: () => void
}

export function useUserAuth(): UseUserAuthReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const clearError = () => setError('')
  const clearSuccess = () => setSuccessMessage('')

  const login = async ({ email, password }: LoginCredentials): Promise<boolean> => {
    setIsLoading(true)
    setError('')

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message || 'Invalid email or password')
        return false
      }

      if (data.user) {
        return true
      }

      return false
    } catch {
      setError('An unexpected error occurred')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async ({ email, password, name, phone }: SignupCredentials): Promise<boolean> => {
    setIsLoading(true)
    setError('')

    try {
      // Create the auth user with metadata
      // Profile will be created automatically via database trigger
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message || 'Failed to create account')
        return false
      }

      if (!data.user) {
        setError('Failed to create account')
        return false
      }

      return true
    } catch {
      setError('An unexpected error occurred')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setIsLoading(false)
    }
  }

  const resetPassword = async (email: string): Promise<boolean> => {
    setIsLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email')
        return false
      }

      setSuccessMessage('Check your email for a password reset link')
      return true
    } catch {
      setError('An unexpected error occurred')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const updatePassword = async (newPassword: string): Promise<boolean> => {
    setIsLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setError(updateError.message || 'Failed to update password')
        return false
      }

      setSuccessMessage('Password updated successfully')
      return true
    } catch {
      setError('An unexpected error occurred')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    error,
    successMessage,
    login,
    signup,
    logout,
    resetPassword,
    updatePassword,
    clearError,
    clearSuccess,
  }
}
