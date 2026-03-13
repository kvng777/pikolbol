'use client'

import { Shield, Loader2 } from 'lucide-react'
import { LoginForm } from '@/components/admin/LoginForm'
import { useAdminLogin } from '@/hooks/useAdminLogin'

export default function AdminLoginPage() {
  const { isLoading, isCheckingAuth, error, login } = useAdminLogin()

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <main className="relative z-10 min-h-screen flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/25">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
              <p className="text-sm text-gray-500 mt-2">
                Sign in to manage your bookings
              </p>
            </div>

            <LoginForm
              onSubmit={login}
              isLoading={isLoading}
              error={error}
            />
          </div>

          <p className="text-center text-sm text-gray-400 mt-6">
            Pikolbol Admin Dashboard
          </p>
        </div>
      </main>
    </div>
  )
}
