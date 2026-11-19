'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User, Session } from '@supabase/supabase-js'
import { isCurrentUserAdminAction } from '@/actions/profile'
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

  // Only the latest check may update state; a sign-out or newer session wins over an older in-flight check
  const checkIdRef = useRef(0)

  // Check admin status when the session changes.
  // Only the latest check clears `loading`, so a stale check can't end loading while isAdmin is still unset.
  const checkAdminStatus = async (session: Session | null) => {
    const checkId = ++checkIdRef.current

    if (!session?.user) {
      setIsAdmin(false)
      setRole(null)
      setLoading(false)
      return
    }

    try {
      const result = await isCurrentUserAdminAction(session.access_token)
      if (checkId !== checkIdRef.current) return
      setIsAdmin(result.isAdmin)
      setRole(result.role)
    } catch (error) {
      console.error('Error checking admin status:', error)
      if (checkId !== checkIdRef.current) return
      setIsAdmin(false)
      setRole(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      checkAdminStatus(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      checkAdminStatus(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    checkIdRef.current++
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
