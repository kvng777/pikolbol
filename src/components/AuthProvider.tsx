'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, SupabaseClient } from '@/lib/supabase'
import { User, Session } from '@supabase/supabase-js'
import { isUserAdminAction } from '@/actions/profile'
import { UserRole } from '@/types/profile'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
  role: UserRole | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  role: null,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState<UserRole | null>(null)

  // Check admin status when user changes
  const checkAdminStatus = async (userId: string | undefined) => {
    if (!userId) {
      setIsAdmin(false)
      setRole(null)
      return
    }

    try {
      const result = await isUserAdminAction(userId)
      setIsAdmin(result.isAdmin)
      setRole(result.role)
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
      setRole(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      checkAdminStatus(session?.user?.id).then(() => {
        setLoading(false)
      })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      checkAdminStatus(session?.user?.id).then(() => {
        setLoading(false)
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setIsAdmin(false)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, role, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
