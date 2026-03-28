'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  updatePaymentSettingsAction,
  uploadQRCodeAction,
} from '@/actions/paymentSettings'
import { UpdatePaymentSettingsData } from '@/types/payment'

// Re-export usePaymentSettings from usePayment for convenience
export { usePaymentSettings } from './usePayment'

/**
 * Hook to update payment settings
 */
export function useUpdatePaymentSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePaymentSettingsData) => updatePaymentSettingsAction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] })
    },
  })
}

/**
 * Hook to upload QR code
 */
export function useUploadQRCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return uploadQRCodeAction(formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentSettings'] })
    },
  })
}
