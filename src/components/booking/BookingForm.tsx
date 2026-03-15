'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingFormData } from '@/types/booking'
import { User, Phone, Mail } from 'lucide-react'

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  email: z.string().email('Please enter a valid email address'),
  players: z.number().min(2, 'Minimum of 2 players'),
})

type FormData = z.infer<typeof formSchema>

type BulkBookingPayload = {
  name: string
  phone: string
  email: string
  date: string
  timeSlots: string[]
  courtNumber: number
  players?: number
}

interface BookingFormProps {
  selectedDate: string
  selectedSlots: string[]
  onSubmit: (data: BulkBookingPayload) => Promise<void>
  isSubmitting?: boolean
}

export function BookingForm({
  selectedDate,
  selectedSlots,
  onSubmit,
  isSubmitting,
}: BookingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { players: 2 },
  })

  const handleFormSubmit = async (data: FormData) => {
    // Send a single bulk booking request for all selected slots
    await onSubmit({
      name: data.name,
      phone: data.phone,
      email: data.email,
      date: selectedDate,
      timeSlots: selectedSlots,
      courtNumber: 1,
      players: data.players,
    })
  }

  // Dynamic pricing: Php200 per 1-hour timeslot. Base covers up to 4 players.
  // Additional Php50 per extra player (beyond 4) applied once per booking.
  const playersCount = Number(watch('players') ?? 2)
  const slotsCount = Math.max(1, selectedSlots.length)
  const pricePerSlot = 200
  const baseTotal = pricePerSlot * slotsCount
  const extraPlayers = Math.max(0, playersCount - 4)
  const extraCharge = extraPlayers * 50
  const totalCost = baseTotal + extraCharge
  const formattedTotal = `Php${totalCost.toLocaleString()}`

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-gray-700 text-sm">Full Name</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            id="name"
            placeholder="John Doe"
            className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 pl-10"
            {...register('name')}
          />
        </div>
        {errors.name && (
          <p className="text-sm text-red-500">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="players" className="text-gray-700 text-sm">Players</Label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const current = Number(getValues('players') ?? 2)
              setValue('players', Math.max(2, current - 1), { shouldValidate: true, shouldDirty: true })
            }}
            className="w-8 h-8 bg-gray-50 border border-gray-200 rounded text-gray-700"
          >-
          </button>

          {/* visual centered display */}
          <div className="w-10 h-8 flex items-center justify-center bg-gray-50 border border-gray-200 rounded text-gray-900">
            {playersCount}
          </div>
          {/* hidden input preserves form value for react-hook-form submission */}
          <input type="hidden" id="players" {...register('players', { valueAsNumber: true })} />

          <button
            type="button"
            onClick={() => {
              const current = Number(getValues('players') ?? 2)
              setValue('players', current + 1, { shouldValidate: true, shouldDirty: true })
            }}
            className="w-8 h-8 bg-gray-50 border border-gray-200 rounded text-gray-700"
          >+
          </button>
          <span className="text-s text-gray-500">If {'>'} 4 players, additional Php50 per player</span>
        </div>
        {errors.players && (
          <p className="text-sm text-red-500">{errors.players.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-gray-700 text-sm">Phone Number</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            id="phone"
            placeholder="1234567890"
            className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 pl-10"
            {...register('phone')}
          />
        </div>
        {errors.phone && (
          <p className="text-sm text-red-500">{errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-gray-700 text-sm">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 pl-10"
            {...register('email')}
          />
        </div>
        {errors.email && (
          <p className="text-sm text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-gray-700 text-sm">Selected Time{selectedSlots.length > 1 ? 's' : ''}</Label>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="font-medium text-emerald-700">
            {selectedSlots.length === 1 
              ? selectedSlots[0] 
              : `${selectedSlots.length} slots: ${selectedSlots.join(', ')}`
            }
          </p>
        </div>
      </div>

      <Button 
        type="submit" 
        disabled={isSubmitting}
        className="text-lg w-full bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0 h-11 font-medium"
      >
        {isSubmitting ? 'Booking...' : (
          selectedSlots.length > 1 
            ? `Book ${selectedSlots.length} Slots — ${formattedTotal}` 
            : `Confirm Booking — ${formattedTotal}`
        )}
      </Button>
    </form>
  )
}
