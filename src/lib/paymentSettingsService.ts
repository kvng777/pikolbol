/**
 * Payment Settings Service
 * CRUD operations for payment configuration
 */

import { supabase } from './supabase-server'
import { PaymentSettings, UpdatePaymentSettingsData } from '@/types/payment'
import { DEFAULT_PAYMENT_TIMEOUT_MINUTES } from './paymentConfig'

/**
 * Get the current payment settings
 * Returns the first (and should be only) row from payment_settings
 */
export async function getPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    // If no settings exist, return default
    if (error.code === 'PGRST116') {
      return {
        id: '',
        gcash_qr_url: null,
        gcash_name: null,
        gcash_number: null,
        payment_timeout_minutes: DEFAULT_PAYMENT_TIMEOUT_MINUTES,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }
    console.error('Error fetching payment settings:', error)
    return null
  }

  return data
}

/**
 * Update payment settings
 * Creates the settings row if it doesn't exist (upsert)
 */
export async function updatePaymentSettings(
  updates: UpdatePaymentSettingsData
): Promise<PaymentSettings | null> {
  // First, try to get existing settings
  const existing = await getPaymentSettings()

  if (existing && existing.id) {
    // Update existing
    const { data, error } = await supabase
      .from('payment_settings')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating payment settings:', error)
      return null
    }

    return data
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('payment_settings')
      .insert({
        ...updates,
        payment_timeout_minutes: updates.payment_timeout_minutes || DEFAULT_PAYMENT_TIMEOUT_MINUTES,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating payment settings:', error)
      return null
    }

    return data
  }
}

/**
 * Upload QR code image to Supabase Storage
 * Returns the public URL of the uploaded image
 */
export async function uploadQRCodeImage(
  file: File | Blob,
  fileName: string
): Promise<{ url: string | null; error?: string }> {
  // Delete any existing QR code first
  const { data: existingFiles } = await supabase.storage
    .from('payment-assets')
    .list()

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles
      .filter(f => f.name.startsWith('gcash-qr'))
      .map(f => f.name)

    if (filesToDelete.length > 0) {
      await supabase.storage
        .from('payment-assets')
        .remove(filesToDelete)
    }
  }

  // Upload new file
  const uniqueFileName = `gcash-qr-${Date.now()}.${fileName.split('.').pop()}`
  
  const { error: uploadError } = await supabase.storage
    .from('payment-assets')
    .upload(uniqueFileName, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) {
    console.error('Error uploading QR code:', uploadError)
    return { url: null, error: uploadError.message }
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('payment-assets')
    .getPublicUrl(uniqueFileName)

  return { url: urlData.publicUrl }
}

/**
 * Delete QR code image from storage
 */
export async function deleteQRCodeImage(url: string): Promise<{ success: boolean; error?: string }> {
  // Extract filename from URL
  const urlParts = url.split('/')
  const fileName = urlParts[urlParts.length - 1]

  const { error } = await supabase.storage
    .from('payment-assets')
    .remove([fileName])

  if (error) {
    console.error('Error deleting QR code:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
