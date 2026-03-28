'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { QrCode, Upload, Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePaymentSettings, useUpdatePaymentSettings, useUploadQRCode } from '@/hooks/usePaymentSettings'
import { toast } from 'sonner'

const settingsSchema = z.object({
  gcash_name: z.string().min(1, 'Account name is required'),
  gcash_number: z.string().min(10, 'Please enter a valid GCash number'),
  payment_timeout_minutes: z.number().min(5, 'Minimum 5 minutes').max(60, 'Maximum 60 minutes'),
})

type SettingsFormData = z.infer<typeof settingsSchema>

export function PaymentSettings() {
  const { data: settings, isLoading } = usePaymentSettings()
  const updateSettings = useUpdatePaymentSettings()
  const uploadQR = useUploadQRCode()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    values: {
      gcash_name: settings?.gcash_name || '',
      gcash_number: settings?.gcash_number || '',
      payment_timeout_minutes: settings?.payment_timeout_minutes || 15,
    },
  })

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const reader = new FileReader()
    reader.onload = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)

    // Upload
    try {
      const result = await uploadQR.mutateAsync(file)
      if (result.success) {
        toast.success('QR code uploaded successfully')
        setPreviewUrl(null)
      } else {
        toast.error(result.error || 'Failed to upload QR code')
        setPreviewUrl(null)
      }
    } catch {
      toast.error('Failed to upload QR code')
      setPreviewUrl(null)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSaveSettings = async (data: SettingsFormData) => {
    try {
      const result = await updateSettings.mutateAsync(data)
      if (result.success) {
        toast.success('Settings saved successfully')
      } else {
        toast.error(result.error || 'Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  const currentQrUrl = previewUrl || settings?.gcash_qr_url

  console.log('currentQrUrl', currentQrUrl);

  return (
    <div className="space-y-8">
      {/* QR Code Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-100">
            <QrCode className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">GCash QR Code</h3>
            <p className="text-sm text-gray-500">Upload your GCash QR code for customers to scan</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Current QR */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Current QR Code
            </Label>
            {currentQrUrl ? (
              <div className="relative aspect-square max-w-[200px] bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
                <Image
                  src={currentQrUrl}
                  alt="GCash QR Code"
                  fill
                  className="object-contain p-2"
                />
                {uploadQR.isPending && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-square max-w-[200px] bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center">
                <p className="text-gray-400 text-sm text-center p-4">No QR code uploaded</p>
              </div>
            )}
          </div>

          {/* Upload */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Upload New QR Code
            </Label>
            <div 
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-emerald-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-1">Click to upload</p>
              <p className="text-xs text-gray-400">PNG, JPEG, WebP (max 5MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Tip: Open your GCash app, go to "Receive Money", and screenshot the QR code.
            </p>
          </div>
        </div>
      </div>

      {/* Account Details */}
      <form onSubmit={handleSubmit(handleSaveSettings)}>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-6">GCash Account Details</h3>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="gcash_name" className="text-sm font-medium text-gray-700">
                Account Name
              </Label>
              <Input
                id="gcash_name"
                placeholder="Juan Dela Cruz"
                {...register('gcash_name')}
              />
              {errors.gcash_name && (
                <p className="text-sm text-red-500">{errors.gcash_name.message}</p>
              )}
              <p className="text-xs text-gray-500">This will be displayed to customers</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gcash_number" className="text-sm font-medium text-gray-700">
                GCash Number
              </Label>
              <Input
                id="gcash_number"
                placeholder="09171234567"
                {...register('gcash_number')}
              />
              {errors.gcash_number && (
                <p className="text-sm text-red-500">{errors.gcash_number.message}</p>
              )}
              <p className="text-xs text-gray-500">Customers can use this if QR scan doesn't work</p>
            </div>
          </div>
        </div>

        {/* Payment Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h3 className="font-semibold text-gray-900 mb-6">Payment Settings</h3>

          <div className="max-w-xs">
            <Label htmlFor="payment_timeout_minutes" className="text-sm font-medium text-gray-700">
              Payment Timeout (minutes)
            </Label>
            <Input
              id="payment_timeout_minutes"
              type="number"
              min={5}
              max={60}
              {...register('payment_timeout_minutes', { valueAsNumber: true })}
            />
            {errors.payment_timeout_minutes && (
              <p className="text-sm text-red-500">{errors.payment_timeout_minutes.message}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              How long customers have to complete payment before the booking expires
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6">
          <Button
            type="submit"
            disabled={!isDirty || updateSettings.isPending}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
          >
            {updateSettings.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save Settings
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
