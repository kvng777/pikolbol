import { PaymentStatus } from './payment'

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
  user_id?: string | null
  // Payment fields
  payment_status?: PaymentStatus
  payment_deadline?: string | null
  payment_confirmed_at?: string | null
  payment_amount?: number | null
}

export interface TimeSlot {
  time: string
  available: boolean
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
  user_id?: string
}

export interface CancelBookingResult {
  success: boolean
  error?: string
}
