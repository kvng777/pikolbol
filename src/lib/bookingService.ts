import { supabase } from './supabase-server'
import { Booking, BookingFormData, CreateBookingResult, DisabledSlot, ClosedDate } from '@/types/booking'

export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('date', date)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching bookings:', error)
    return []
  }

  return data || []
}

export async function getAllBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching all bookings:', error)
    return []
  }

  return data || []
}

export async function createBooking(booking: BookingFormData): Promise<CreateBookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      name: booking.name,
      phone: booking.phone,
      email: booking.email,
      date: booking.date,
      time_slot: booking.timeSlot,
      court_number: booking.courtNumber,
      players: booking.players,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'This time slot has already been booked. Please select another slot.',
      }
    }
    return {
      success: false,
      error: error.message || 'Failed to create booking',
    }
  }

  return {
    success: true,
    booking: data,
  }
}

export async function createBookings(payload: { name: string; phone: string; email: string; date: string; timeSlots: string[]; court_number: number; players?: number }): Promise<{ success: boolean; bookings?: Booking[]; error?: string }> {
  const rows = payload.timeSlots.map((ts) => ({
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    date: payload.date,
    time_slot: ts,
    court_number: payload.court_number,
    players: payload.players,
  }))

  const { data, error } = await supabase
    .from('bookings')
    .insert(rows)
    .select()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'One or more selected time slots are already booked. Please refresh and try again.' }
    }
    return { success: false, error: error.message || 'Failed to create bookings' }
  }

  return { success: true, bookings: data }
}

export async function deleteBooking(id: string): Promise<{ success: boolean; error?: string }> {
  console.log('Deleting booking with id:', id)
  // Debug: check whether the booking exists and is accessible before attempting delete
  try {
    const existing = await getBookingById(id)
    console.log('Existing booking before delete:', existing)
  } catch (err) {
    console.log('Error fetching existing booking before delete:', err)
  }
  const { error, data } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)
    .select()

  console.log('Supabase delete result:', { error, data })

  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }

  // Check if data is empty (no row deleted)
  if (!data || data.length === 0) {
    return {
      success: false,
      error: 'No booking deleted. ID may be incorrect.',
    }
  }

  return { success: true }
}

export async function getDisabledSlotsByDate(date: string): Promise<DisabledSlot[]> {
  const { data, error } = await supabase
    .from('disabled_slots')
    .select('*')
    .eq('date', date)
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching disabled slots:', error)
    return []
  }

  return data || []
}

export async function addDisabledSlot(date: string, timeSlot: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('disabled_slots')
    .insert({ date, time_slot: timeSlot })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function removeDisabledSlot(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('disabled_slots')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function getAllDisabledSlots(): Promise<DisabledSlot[]> {
  const { data, error } = await supabase
    .from('disabled_slots')
    .select('*')
    .order('date', { ascending: false })
    .order('time_slot', { ascending: true })

  if (error) {
    console.error('Error fetching all disabled slots:', error)
    return []
  }

  return data || []
}

export async function getClosedDates(): Promise<ClosedDate[]> {
  const { data, error } = await supabase
    .from('closed_dates')
    .select('*')
    .order('start_date', { ascending: false })

  if (error) {
    console.error('Error fetching closed dates:', error)
    return []
  }

  return data || []
}

export async function addClosedDate(startDate: string, endDate: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('closed_dates')
    .insert({ start_date: startDate, end_date: endDate, reason })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function removeClosedDate(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('closed_dates')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function isDateClosed(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('closed_dates')
    .select('id')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1)

  if (error) {
    console.error('Error checking closed date:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching booking by ID:', error)
    return null
  }

  return data || null
}
