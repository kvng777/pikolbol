'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, CalendarDays, Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useProfile, useUpsertProfile } from '@/hooks/useProfile'
import { useUserBookings, useCancelBooking } from '@/hooks/useBookings'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { BookingHistory } from '@/components/profile/BookingHistory'
import NavBar from '@/components/NavBar'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: bookings = [], isLoading: bookingsLoading } = useUserBookings(user?.id)
  const upsertProfile = useUpsertProfile()
  const cancelBooking = useCancelBooking()

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [authLoading, user, router])

  const handleProfileSubmit = async (data: { name: string; phone: string }) => {
    try {
      await upsertProfile.mutateAsync(data)
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
      console.error('Profile update error:', error)
    }
  }

  const handleCancelBooking = async (bookingId: string) => {
    if (!user?.id) return

    try {
      const result = await cancelBooking.mutateAsync({ bookingId, userId: user.id })
      if (result.success) {
        toast.success('Booking cancelled successfully')
      } else {
        toast.error(result.error || 'Failed to cancel booking')
      }
    } catch (error) {
      toast.error('Failed to cancel booking')
      console.error('Cancel booking error:', error)
    }
  }

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 py-8 pt-24">
        {/* Back link */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-gray-600 hover:text-emerald-600 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Booking
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">My Account</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile Section */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-emerald-100">
                <User className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
            </div>

            {profileLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <ProfileForm
                profile={profile || null}
                email={user.email || ''}
                onSubmit={handleProfileSubmit}
                isSubmitting={upsertProfile.isPending}
              />
            )}
          </div>

          {/* Bookings Section */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-emerald-100">
                <CalendarDays className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">My Bookings</h2>
            </div>

            <BookingHistory
              bookings={bookings}
              isLoading={bookingsLoading}
              onCancelBooking={handleCancelBooking}
              isCancelling={cancelBooking.isPending}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
