'use server'

import { revalidatePath } from 'next/cache'
import {
  getPaymentSettings,
  updatePaymentSettings,
  uploadQRCodeImage,
} from '@/lib/paymentSettingsService'
import { PaymentSettings, UpdatePaymentSettingsData, PaymentSettingsResult } from '@/types/payment'

/**
 * Get current payment settings
 */
export async function getPaymentSettingsAction(): Promise<PaymentSettings | null> {
  return getPaymentSettings()
}

/**
 * Update payment settings (admin only)
 */
export async function updatePaymentSettingsAction(
  data: UpdatePaymentSettingsData
): Promise<PaymentSettingsResult> {
  const settings = await updatePaymentSettings(data)

  if (!settings) {
    return { success: false, error: 'Failed to update payment settings' }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return { success: true, settings }
}

/**
 * Upload GCash QR code image and update settings
 */
export async function uploadQRCodeAction(
  formData: FormData
): Promise<PaymentSettingsResult> {
  const file = formData.get('file') as File
  
  if (!file) {
    return { success: false, error: 'No file provided' }
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Invalid file type. Please upload a PNG, JPEG, or WebP image.' }
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    return { success: false, error: 'File too large. Maximum size is 5MB.' }
  }

  // Upload to Supabase Storage
  const { url, error: uploadError } = await uploadQRCodeImage(file, file.name)

  if (uploadError || !url) {
    return { success: false, error: uploadError || 'Failed to upload image' }
  }

  // Update settings with new URL
  const settings = await updatePaymentSettings({ gcash_qr_url: url })

  if (!settings) {
    return { success: false, error: 'Failed to update settings with new QR code' }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return { success: true, settings }
}
