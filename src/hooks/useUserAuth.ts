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
  login: (credentials: LoginCredentials) => Promise<boolean>
  signup: (credentials: SignupCredentials) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export function useUserAuth(): UseUserAuthReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const clearError = () => setError('')

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

  return {
    isLoading,
    error,
    login,
    signup,
    logout,
    clearError,
  }
}
