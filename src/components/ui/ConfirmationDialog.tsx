'use client'

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from './button'

export type ConfirmationVariant = 'confirm' | 'reject' | 'warning' | 'danger'

interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmationVariant
  isLoading?: boolean
  children?: React.ReactNode  // For additional content like booking details
}

const variantStyles: Record<ConfirmationVariant, {
  icon: React.ReactNode
  iconBg: string
  confirmButton: string
}> = {
  confirm: {
    icon: <CheckCircle className="w-6 h-6 text-emerald-600" />,
    iconBg: 'bg-emerald-100',
    confirmButton: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  reject: {
    icon: <XCircle className="w-6 h-6 text-red-600" />,
    iconBg: 'bg-red-100',
    confirmButton: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
    iconBg: 'bg-amber-100',
    confirmButton: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    icon: <AlertTriangle className="w-6 h-6 text-red-600" />,
    iconBg: 'bg-red-100',
    confirmButton: 'bg-red-600 hover:bg-red-700 text-white',
  },
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false,
  children,
}: ConfirmationDialogProps) {
  const isClient = typeof document !== 'undefined'
  const styles = variantStyles[variant]

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!open || !isClient) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose()
    }
    
    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, isLoading, isClient])

  if (!open || !isClient) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={isLoading ? undefined : onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        {!isLoading && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 mx-auto rounded-full ${styles.iconBg} flex items-center justify-center mb-4`}>
            {styles.icon}
          </div>

          {/* Title & Description */}
          <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-600 text-center mb-4">
            {description}
          </p>

          {/* Additional Content (booking details, etc.) */}
          {children && (
            <div className="mb-6">
              {children}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              className={`flex-1 ${styles.confirmButton}`}
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                confirmText
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
