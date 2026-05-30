'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Megaphone, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNoticeSettings, useUpdateNotice } from '@/hooks/useNotice'
import { toast } from 'sonner'

const noticeSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(120, 'Keep the title under 120 characters'),
    message: z.string().min(1, 'Description is required'),
    is_enabled: z.boolean(),
    auto_close_seconds: z
      .number({ message: 'Enter a number of seconds' })
      .int('Use a whole number')
      .min(1, 'Minimum 1 second')
      .max(60, 'Maximum 60 seconds'),
    start_date: z.string(),
    end_date: z.string(),
  })
  .refine(
    (data) => !data.start_date || !data.end_date || data.start_date <= data.end_date,
    { message: 'End date must be on or after the start date', path: ['end_date'] }
  )

type NoticeFormData = z.infer<typeof noticeSchema>

export function NoticeSettings() {
  const { data: notice, isLoading } = useNoticeSettings()
  const updateNotice = useUpdateNotice()

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<NoticeFormData>({
    resolver: zodResolver(noticeSchema),
    values: {
      title: notice?.title || '',
      message: notice?.message || '',
      is_enabled: notice?.is_enabled ?? false,
      auto_close_seconds: notice?.auto_close_seconds ?? 10,
      start_date: notice?.start_date || '',
      end_date: notice?.end_date || '',
    },
  })

  const handleSave = async (data: NoticeFormData) => {
    try {
      const result = await updateNotice.mutateAsync({
        title: data.title,
        message: data.message,
        is_enabled: data.is_enabled,
        auto_close_seconds: data.auto_close_seconds,
        // Normalize empty date inputs to null (no bound)
        start_date: data.start_date || null,
        end_date: data.end_date || null,
      })

      if (result.success) {
        toast.success('Notice saved successfully')
      } else {
        toast.error(result.error || 'Failed to save notice')
      }
    } catch {
      toast.error('Failed to save notice')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-100">
            <Megaphone className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Site Notice</h3>
            <p className="text-sm text-gray-500">
              Shown as a pop-up announcement to visitors on the home page
            </p>
          </div>
        </div>

        {/* Enable toggle */}
        <label className="flex items-center justify-between gap-4 p-4 rounded-lg bg-gray-50 border border-gray-200 cursor-pointer mb-6">
          <div>
            <p className="text-sm font-medium text-gray-900">Display notice</p>
            <p className="text-xs text-gray-500">
              Toggle to show or hide the announcement on the home page
            </p>
          </div>
          <input type="checkbox" className="peer sr-only" {...register('is_enabled')} />
          <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-gray-300 transition-colors peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
        </label>

        {/* Title */}
        <div className="space-y-2 mb-6">
          <Label htmlFor="title" className="text-sm font-medium text-gray-700">
            Title
          </Label>
          <Input id="title" placeholder="e.g., Promo Ending Soon" {...register('title')} />
          {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="message" className="text-sm font-medium text-gray-700">
            Description
          </Label>
          <textarea
            id="message"
            rows={8}
            placeholder="Write the announcement details here..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
            {...register('message')}
          />
          {errors.message && <p className="text-sm text-red-500">{errors.message.message}</p>}
          <p className="text-xs text-gray-500">Line breaks are preserved in the notice.</p>
        </div>

        {/* Auto-close timer */}
        <div className="space-y-2 mt-6 max-w-xs">
          <Label htmlFor="auto_close_seconds" className="text-sm font-medium text-gray-700">
            Auto-close after (seconds)
          </Label>
          <Input
            id="auto_close_seconds"
            type="number"
            min={1}
            max={60}
            {...register('auto_close_seconds', { valueAsNumber: true })}
          />
          {errors.auto_close_seconds && (
            <p className="text-sm text-red-500">{errors.auto_close_seconds.message}</p>
          )}
          <p className="text-xs text-gray-500">
            How long the notice stays on screen before closing automatically (1-60s).
          </p>
        </div>
      </div>

      {/* Display window */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Display Window (optional)</h3>
        <p className="text-sm text-gray-500 mb-6">
          Automatically show and hide the notice between dates. Leave empty to show indefinitely while enabled.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="start_date" className="text-sm font-medium text-gray-700">
              Show from
            </Label>
            <input
              id="start_date"
              type="date"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              {...register('start_date')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date" className="text-sm font-medium text-gray-700">
              Show until
            </Label>
            <input
              id="end_date"
              type="date"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              {...register('end_date')}
            />
            {errors.end_date && <p className="text-sm text-red-500">{errors.end_date.message}</p>}
          </div>
        </div>
      </div>

      {/* Save */}
      <Button
        type="submit"
        disabled={!isDirty || updateNotice.isPending}
        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
      >
        {updateNotice.isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save Notice
          </span>
        )}
      </Button>
    </form>
  )
}
