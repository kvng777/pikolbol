'use server'

import { 
  createBooking, 
  getBookingsByDate, 
  getAllBookings, 
  deleteBooking,
  getDisabledSlotsByDate,
  addDisabledSlot,
  removeDisabledSlot,
  getAllDisabledSlots,
  getClosedDates,
  addClosedDate,
  removeClosedDate,
  isDateClosed
} from '@/lib/bookingService'
import { BookingFormData, Booking, CreateBookingResult, DisabledSlot, ClosedDate } from '@/types/booking'
import { revalidatePath } from 'next/cache'

export async function createBookingAction(data: BookingFormData): Promise<CreateBookingResult> {
  const isClosed = await isDateClosed(data.date)
  if (isClosed) {
    return {
      success: false,
      error: 'The court is closed on this date. Please select another date.',
    }
  }

  const result = await createBooking(data)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

export async function getBookingsByDateAction(date: string): Promise<Booking[]> {
  return getBookingsByDate(date)
}

export async function getAllBookingsAction(): Promise<Booking[]> {
  return getAllBookings()
}

export async function deleteBookingAction(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await deleteBooking(id)

  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }

  return result
}

export async function getDisabledSlotsByDateAction(date: string): Promise<DisabledSlot[]> {
  return getDisabledSlotsByDate(date)
}

export async function addDisabledSlotAction(date: string, timeSlot: string): Promise<{ success: boolean; error?: string }> {
  const result = await addDisabledSlot(date, timeSlot)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function removeDisabledSlotAction(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await removeDisabledSlot(id)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function getAllDisabledSlotsAction(): Promise<DisabledSlot[]> {
  return getAllDisabledSlots()
}

export async function getClosedDatesAction(): Promise<ClosedDate[]> {
  return getClosedDates()
}

export async function addClosedDateAction(startDate: string, endDate: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const result = await addClosedDate(startDate, endDate, reason)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}

export async function removeClosedDateAction(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await removeClosedDate(id)
  if (result.success) {
    revalidatePath('/')
    revalidatePath('/admin')
  }
  return result
}
