'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { Clock, QrCode, CheckCircle, AlertTriangle, Loader2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaymentCountdown, usePaymentStatus, useMarkPaymentSubmitted, usePaymentSettings } from '@/hooks/usePayment'
import { Booking } from '@/types/booking'
import { PaymentStatus } from '@/types/payment'

interface PaymentScreenProps {
  bookings: Booking[]
  amount: number
  deadline: string
  onPaymentConfirmed: () => void
  onPaymentExpired: () => void
  onCancel: () => void
}

export function PaymentScreen({
  bookings,
  amount,
  deadline,
  onPaymentConfirmed,
  onPaymentExpired,
  onCancel,
}: PaymentScreenProps) {
  const [copiedNumber, setCopiedNumber] = useState(false)
  const bookingIds = bookings.map(b => b.id)
  
  const { remainingSeconds, formattedTime, isExpired } = usePaymentCountdown(deadline)
  const { data: currentBookings } = usePaymentStatus(bookingIds)
  const { data: settings } = usePaymentSettings()
  const markSubmitted = useMarkPaymentSubmitted()

  // Check payment status
  const paymentStatus = currentBookings?.[0]?.payment_status as PaymentStatus | undefined

  // Handle status changes
  useEffect(() => {
    if (paymentStatus === 'confirmed') {
      onPaymentConfirmed()
    } else if (paymentStatus === 'expired' || paymentStatus === 'rejected') {
      onPaymentExpired()
    }
  }, [paymentStatus, onPaymentConfirmed, onPaymentExpired])

  // Handle expiry (only when user hasn't submitted payment yet)
  useEffect(() => {
    if (isExpired && paymentStatus === 'awaiting_payment') {
      onPaymentExpired()
    }
  }, [isExpired, paymentStatus, onPaymentExpired])

  const handleMarkPaid = async () => {
    await markSubmitted.mutateAsync(bookingIds)
  }

  const handleCopyNumber = async () => {
    if (settings?.gcash_number) {
      await navigator.clipboard.writeText(settings.gcash_number)
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    }
  }

  const formattedDate = bookings[0]?.date 
    ? format(new Date(bookings[0].date), 'EEEE, MMMM d, yyyy')
    : ''
  
  const timeSlots = bookings.map(b => b.time_slot).join(', ')

  // Different UI based on payment status
  // Show "Awaiting Verification" when user has submitted payment (pending status)
  if (paymentStatus === 'pending') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
              <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Awaiting Confirmation</h2>
            <p className="text-gray-600 mb-6">
              Thank you! We&apos;ve received your payment notification. Please wait while we verify your payment.
            </p>

            {/* Booking Summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Booking Summary</h3>
              <p className="text-gray-900 font-medium">{formattedDate}</p>
              <p className="text-gray-600 text-sm">{timeSlots}</p>
              <p className="text-emerald-600 font-semibold mt-2">Php {amount.toLocaleString()}</p>
            </div>

            <p className="text-sm text-gray-500">
              You&apos;ll receive an email once your payment is confirmed. This usually takes a few minutes.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show expired state
  if (isExpired || paymentStatus === 'expired') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Time Expired</h2>
            <p className="text-gray-600 mb-6">
              The payment window has expired. The time slot has been released and is available for booking again.
            </p>

            <Button
              onClick={onCancel}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
            >
              Return to Booking
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 rounded-t-2xl">
          <h2 className="text-xl font-bold text-white text-center">Complete Payment</h2>
        </div>

        <div className="p-6">
          {/* Timer */}
          <div className={`flex items-center justify-center gap-2 mb-6 p-3 rounded-xl ${
            remainingSeconds < 120 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
          }`}>
            <Clock className="w-5 h-5" />
            <span className="font-semibold">Time remaining: {formattedTime}</span>
          </div>

          {/* Amount */}
          <div className="text-center mb-6">
            <p className="text-sm text-gray-500">Amount to Pay</p>
            <p className="text-3xl font-bold text-gray-900">Php {amount.toLocaleString()}</p>
          </div>

          {/* QR Code */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <span className="font-medium text-gray-900">Scan QR Code with GCash</span>
            </div>

            {settings?.gcash_qr_url ? (
              <div className="relative aspect-square max-w-[250px] mx-auto bg-white rounded-lg overflow-hidden border-2 border-emerald-200">
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
              <div className="mt-4 pt-4 border-t border-gray-200">
                {settings.gcash_name && (
                  <p className="text-center text-gray-600">
                    <span className="text-gray-500">Name:</span>{' '}
                    <span className="font-medium">{settings.gcash_name}</span>
                  </p>
                )}
                {settings.gcash_number && (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-gray-500">Number:</span>
                    <span className="font-medium text-gray-600">{settings.gcash_number}</span>
                    <button
                      onClick={handleCopyNumber}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                      title="Copy number"
                    >
                      {copiedNumber ? (
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

          {/* Instructions */}
          <div className="bg-blue-50 rounded-xl p-4 mb-6">
            <h3 className="font-medium text-blue-900 mb-2">How to Pay:</h3>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>1. Open your GCash app</li>
              <li>2. Tap &quot;Scan QR&quot; or &quot;Send Money&quot;</li>
              <li>3. Scan the QR code above or enter the number</li>
              <li>4. Enter exact amount: <strong>Php {amount.toLocaleString()}</strong></li>
              <li>5. Complete the payment</li>
              <li>6. Click &quot;I&apos;ve Completed Payment&quot; below</li>
            </ol>
          </div>

          {/* Booking Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Booking Summary</h3>
            <p className="text-gray-900 font-medium">{formattedDate}</p>
            <p className="text-gray-600 text-sm">{timeSlots}</p>
            <p className="text-gray-600 text-sm">{bookings[0]?.players} players</p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleMarkPaid}
              disabled={markSubmitted.isPending}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium"
            >
              {markSubmitted.isPending ? (
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
              className="w-full"
            >
              Cancel Booking
            </Button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            Your slot is reserved until the timer expires. Payment will be verified by our team.
          </p>
        </div>
      </div>
    </div>
  )
}
