'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { QrCode, CheckCircle, Loader2, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubmitPayment, usePaymentStatus, usePaymentSettings } from '@/hooks/usePayment'
import { Booking } from '@/types/booking'
import { PaymentStatus } from '@/types/payment'
import { toast } from 'sonner'

// Data needed to create a booking (before it's in the database)
export interface BookingData {
  name: string
  phone: string
  email: string
  date: string
  timeSlots: string[]
  courtNumber: number
  players: number
  user_id?: string
}

interface PaymentScreenProps {
  bookingData: BookingData
  amount: number
  onPaymentSubmitted: (bookings: Booking[]) => void
  onPaymentConfirmed: () => void
  onCancel: () => void
}

export function PaymentScreen({
  bookingData,
  amount,
  onPaymentSubmitted,
  onPaymentConfirmed,
  onCancel,
}: PaymentScreenProps) {
  const [copiedField, setCopiedField] = useState<'name' | 'number' | null>(null)
  const [submittedBookings, setSubmittedBookings] = useState<Booking[] | null>(null)
  const [gcashReference, setGcashReference] = useState('')
  
  const { data: settings, isLoading: settingsLoading } = usePaymentSettings()
  const submitPayment = useSubmitPayment()
  
  // Only poll for status after payment is submitted
  const bookingIds = submittedBookings?.map(b => b.id) || []
  const { data: currentBookings } = usePaymentStatus(bookingIds)
  
  // Check payment status after submission
  const paymentStatus = currentBookings?.[0]?.payment_status as PaymentStatus | undefined

  // Handle status changes after submission
  useEffect(() => {
    if (paymentStatus === 'confirmed') {
      onPaymentConfirmed()
    }
  }, [paymentStatus, onPaymentConfirmed])

  const handleSubmitPayment = async () => {
    try {
      const result = await submitPayment.mutateAsync({
        name: bookingData.name,
        phone: bookingData.phone,
        email: bookingData.email,
        date: bookingData.date,
        timeSlots: bookingData.timeSlots,
        courtNumber: bookingData.courtNumber,
        players: bookingData.players,
        user_id: bookingData.user_id,
        gcashReference: gcashReference.trim(),
      })

      if (result.success && result.bookings) {
        setSubmittedBookings(result.bookings)
        onPaymentSubmitted(result.bookings)
        toast.success('Payment submitted! Waiting for confirmation.')
      } else {
        toast.error(result.error || 'Failed to submit payment')
      }
    } catch {
      toast.error('Failed to submit payment')
    }
  }

  const handleCopy = async (field: 'name' | 'number', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const formattedDate = format(new Date(bookingData.date), 'EEEE, MMMM d, yyyy')
  const timeSlots = bookingData.timeSlots.join(', ')

  // Show "Awaiting Verification" after payment is submitted
  if (submittedBookings) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Awaiting Verification</h2>
            <p className="text-gray-600 mb-6">
              Thank you! We&apos;ve received your payment notification. Please wait while we verify your payment.
            </p>

            {/* Booking Summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Booking Summary</h3>
              <p className="text-gray-900 font-medium">{formattedDate}</p>
              <p className="text-gray-600 text-sm">{timeSlots}</p>
              <p className="text-emerald-600 font-semibold mt-2">₱{amount.toLocaleString()}</p>
            </div>

            <p className="text-sm text-gray-500">
              You&apos;ll receive an email once your payment is confirmed. This usually takes a few minutes.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Payment form (before submission)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Complete Payment</h2>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-2">
          {/* Amount */}
          <div className="text-center mb-3">
            <p className="text-sm text-gray-500">Amount to Pay</p>
            <p className="text-2xl font-bold text-gray-900">₱{amount.toLocaleString()}</p>
          </div>

          {/* QR Code */}
          <div className="bg-gray-50 rounded-xl p-4 mb-3">
            <div className="flex items-center justify-center gap-2 mb-3">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <span className="font-medium text-gray-900">Scan QR Code with GCash</span>
            </div>

            {settingsLoading ? (
              <div className="aspect-square max-w-[180px] mx-auto flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            ) : settings?.gcash_qr_url ? (
              <div className="relative aspect-square max-w-[180px] mx-auto bg-white rounded-lg overflow-hidden border-2 border-emerald-200">
                <Image
                  src={settings.gcash_qr_url}
                  alt="GCash QR Code"
                  fill
                  className="object-contain p-2"
                />
              </div>
            ) : (
              <div className="aspect-square max-w-[250px] mx-auto bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                <p className="text-gray-400 text-sm text-center p-4">
                  QR Code not available. Please contact support.
                </p>
              </div>
            )}

            {/* GCash Details */}
            {(settings?.gcash_name || settings?.gcash_number) && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                {settings.gcash_name && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-medium text-gray-700">{settings.gcash_name}</span>
                    <button
                      onClick={() => handleCopy('name', settings.gcash_name!)}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      title="Copy name"
                    >
                      {copiedField === 'name' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                )}
                {settings.gcash_number && (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-gray-500">Number:</span>
                    <span className="font-medium text-gray-700">{settings.gcash_number}</span>
                    <button
                      onClick={() => handleCopy('number', settings.gcash_number!)}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      title="Copy number"
                    >
                      {copiedField === 'number' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Booking Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-3">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Booking Summary</h3>
            <p className="text-gray-900 font-medium">{formattedDate}</p>
            <p className="text-gray-600 text-sm">{timeSlots}</p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <div>
              <label htmlFor="gcash-reference" className="block text-sm font-medium text-gray-700 mb-1">
                GCash Reference Number <span className="text-red-500">*</span>
              </label>
              <input
                id="gcash-reference"
                type="text"
                value={gcashReference}
                onChange={(e) => setGcashReference(e.target.value)}
                disabled={submitPayment.isPending}
                placeholder="e.g. 1234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="text-xs text-gray-400 mt-1">Enter the reference number from your GCash transaction.</p>
            </div>
            <Button
              onClick={handleSubmitPayment}
              disabled={submitPayment.isPending || !gcashReference.trim()}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium"
            >
              {submitPayment.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  I&apos;ve Completed Payment
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={onCancel}
              disabled={submitPayment.isPending}
              className="w-full"
            >
              Cancel
            </Button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            Your booking will be confirmed once we verify your payment.
          </p>
        </div>
      </div>
    </div>
  )
}
