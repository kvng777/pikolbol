'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Phone, Mail, Loader2 } from 'lucide-react'
import { Profile } from '@/types/profile'

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface ProfileFormProps {
  profile: Profile | null
  email: string
  onSubmit: (data: ProfileFormData) => Promise<void>
  isSubmitting: boolean
}

export function ProfileForm({ profile, email, onSubmit, isSubmitting }: ProfileFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile?.name || '',
      phone: profile?.phone || '',
    },
  })

  // Reset form when profile data loads
  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name || '',
        phone: profile.phone || '',
      })
    }
  }, [profile, reset])

  const handleFormSubmit = async (data: ProfileFormData) => {
    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-gray-700">
          Email
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="email"
            type="email"
            value={email}
            disabled
            className="pl-10 h-11 bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
          />
        </div>
        <p className="text-xs text-gray-400">Email cannot be changed</p>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-gray-700">
          Full Name
        </Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="name"
            type="text"
            placeholder="John Doe"
            className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
            disabled={isSubmitting}
            {...register('name')}
          />
        </div>
        {errors.name && (
          <p className="text-sm text-red-500">{errors.name.message}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
          Phone Number
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="phone"
            type="tel"
            placeholder="09123456789"
            className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
            disabled={isSubmitting}
            {...register('phone')}
          />
        </div>
        {errors.phone && (
          <p className="text-sm text-red-500">{errors.phone.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving...
          </span>
        ) : (
          'Save Changes'
        )}
      </Button>
    </form>
  )
}
