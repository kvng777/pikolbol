'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface LoginCredentials {
  email: string
  password: string
}

interface UseAdminLoginReturn {
  isLoading: boolean
  isCheckingAuth: boolean
  error: string
  login: (credentials: LoginCredentials) => Promise<void>
}

export function useAdminLogin(): UseAdminLoginReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkExistingSession()
  }, [])

  const checkExistingSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/admin')
      }
    } finally {
      setIsCheckingAuth(false)
    }
  }

  const login = async ({ email, password }: LoginCredentials) => {
    setIsLoading(true)
    setError('')

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError('Invalid email or password')
        return
      }

      if (data.user) {
        router.push('/admin')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    isCheckingAuth,
    error,
    login,
  }
}
