import { PaymentStatus } from './payment'

export type RefundStatus = 'pending' | 'completed'

export interface Booking {
  id: string
  name: string
  phone: string
  email: string
  date: string
  time_slot: string
  court_number: number
  created_at: string
  players: number
  // Equipment rental
  paddles_count?: number | null
  needs_balls?: boolean | null
  training_balls?: boolean | null
  user_id?: string | null
  // Booking identification
  short_id?: string | null          // Human-readable ID (e.g., 'A1B2')
  booking_group_id?: string | null  // UUID linking slots from same order
  // Payment fields
  payment_status?: PaymentStatus
  payment_deadline?: string | null
  payment_confirmed_at?: string | null
  payment_amount?: number | null
  // Payment reference
  gcash_reference?: string | null
  // Cancellation & refund fields
  cancelled_at?: string | null
  cancellation_fee?: number | null
  refund_amount?: number | null
  refund_status?: RefundStatus | null
  // Manual booking (created by admin on behalf of a player)
  is_manual?: boolean | null
  // Reschedule tracking
  rescheduled_from_date?: string | null
  rescheduled_from_time_slot?: string | null
  rescheduled_at?: string | null
}

export interface TimeSlot {
  time: string
  available: boolean
  reason?: 'past' | 'booked' | 'disabled'
}

export interface BookingFormData {
  name: string
  phone: string
  email: string
  date: string
  timeSlot: string
  courtNumber: number
  players?: number
}

export interface CreateBookingResult {
  success: boolean
  error?: string
  booking?: Booking
  bookings?: Booking[] // For bulk bookings
  paymentDeadline?: string // ISO timestamp for payment deadline
}

export interface DisabledSlot {
  id: string
  date: string
  time_slot: string
  created_at: string
}

export interface ClosedDate {
  id: string
  start_date: string
  end_date: string
  reason: string
  created_at: string
}

export interface BulkBookingPayload {
  name: string
  phone: string
  email: string
  date: string
  timeSlots: string[]
  courtNumber: number
  players?: number
  paddles?: number
  needsBalls?: boolean
  trainingBalls?: boolean
  user_id?: string
}

export interface CancelBookingResult {
  success: boolean
  error?: string
  cancellationFee?: number
  refundAmount?: number
}

export interface RescheduleBookingResult {
  success: boolean
  error?: string
  requestId?: string
}

export type RescheduleRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface RescheduleRequest {
  id: string
  booking_group_id: string | null
  legacy_booking_id: string | null
  user_id: string
  short_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  original_date: string
  original_time_slots: string[]
  new_date: string
  new_time_slots: string[]
  status: RescheduleRequestStatus
  created_at: string
  resolved_at: string | null
}

// Payload for an admin-created (manual) booking
export interface AdminBookingPayload {
  name: string
  date: string
  timeSlots: string[]
  paddles?: number
  needsBalls?: boolean
  trainingBalls?: boolean
}

// Payload for editing an existing manual booking (identified by its group)
export interface AdminBookingUpdatePayload extends AdminBookingPayload {
  bookingGroupId: string
}
