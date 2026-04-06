// Payment status values
export type PaymentStatus = 
  | 'pending'               // User submitted payment, waiting for admin verification
  | 'confirmed'             // Admin verified payment - booking is final
  | 'rejected'              // Admin rejected payment
  | 'cancelled'             // User cancelled the booking

// Payment settings stored in database
export interface PaymentSettings {
  id: string
  gcash_qr_url: string | null
  gcash_name: string | null
  gcash_number: string | null
  payment_timeout_minutes: number
  created_at: string
  updated_at: string
}

// Data for updating payment settings
export interface UpdatePaymentSettingsData {
  gcash_qr_url?: string
  gcash_name?: string
  gcash_number?: string
  payment_timeout_minutes?: number
}

// Result type for payment settings operations
export interface PaymentSettingsResult {
  success: boolean
  error?: string
  settings?: PaymentSettings
}

// Payment info displayed to user
export interface PaymentInfo {
  amount: number
  qrCodeUrl: string | null
  gcashName: string | null
  gcashNumber: string | null
  bookingId: string
  status: PaymentStatus
}

// Result for payment operations
export interface PaymentResult {
  success: boolean
  error?: string
}

// Booking with payment details for admin view
export interface PendingPaymentBooking {
  id: string
  name: string
  email: string
  phone: string
  date: string
  time_slot: string
  court_number: number
  players: number
  payment_status: PaymentStatus
  payment_amount: number
  created_at: string
  user_id: string | null
  // Booking identification
  short_id?: string | null          // Human-readable ID (e.g., 'A1B2')
  booking_group_id?: string | null  // UUID linking slots from same order
  // Payment reference
  gcash_reference?: string | null
}

// Email notification types
export type PaymentEmailType = 'confirmed' | 'rejected'

export interface PaymentEmailData {
  type: PaymentEmailType
  recipientEmail: string
  recipientName: string
  bookingDate: string
  bookingTime: string
  amount: number
  reason?: string // For rejection
}
