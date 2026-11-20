'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form'
import { AlertTriangle, ClipboardCheck, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { MAX_RULE_LABEL } from '@/lib/slotRulesSchema'
import { RULE_OVERLAP_LIMIT, WEEKDAY_SHORT, describeRule, describeTimeSlots, formatRuleDate } from '@/lib/slotRules'
import {
  RULE_SLOTS,
  WEEKDAY_SHORTCUTS,
  applySlotDrag,
  initialSlotRuleFormValues,
  overlapSummary,
  reactivatesRule,
  slotLabel,
  toggleSlot,
  toggleWeekday,
  validateSlotRuleForm,
  type SlotRuleFormValues,
} from '@/lib/slotRuleForm'
import { manilaNow } from '@/lib/agent/dates'
import { useCreateSlotRule, useUpdateSlotRule, usePreviewSlotRuleOverlap } from '@/hooks/useSlotRules'
import type { SlotRule, SlotRuleInput, RuleOverlapBooking } from '@/types/slotRules'

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Same validation as the server (slotRuleInputSchema), shown inline before review.
const slotRuleResolver: Resolver<SlotRuleFormValues> = async (values) => {
  const result = validateSlotRuleForm(values)
  if (result.ok) return { values, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const [key, message] of Object.entries(result.errors)) {
    if (message) errors[key === 'form' ? 'root' : key] = { type: 'validation', message }
  }
  return { values: {}, errors: errors as FieldErrors<SlotRuleFormValues> }
}

interface Review {
  input: SlotRuleInput
  overlaps: RuleOverlapBooking[]
  truncated: boolean
}

interface Props {
  /** Edit this rule; omit to create a new one. */
  initial?: SlotRule | null
  onClose: () => void
}

export function SlotRuleForm({ initial, onClose }: Props) {
  const createRule = useCreateSlotRule()
  const updateRule = useUpdateSlotRule()
  const preview = usePreviewSlotRuleOverlap()
  const saving = createRule.isPending || updateRule.isPending

  const [review, setReview] = useState<Review | null>(null)
  // Synchronous guards: a fast double click can fire twice before `isPending` re-renders.
  const previewInFlight = useRef(false)
  const saveInFlight = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitted, submitCount },
  } = useForm<SlotRuleFormValues>({
    resolver: slotRuleResolver,
    mode: 'onTouched',
    defaultValues: initialSlotRuleFormValues(initial, manilaNow().date),
  })
  const weekdays = useWatch({ control, name: 'weekdays' })
  const timeSlots = useWatch({ control, name: 'timeSlots' })
  const noEnd = useWatch({ control, name: 'noEnd' })
  const startDate = useWatch({ control, name: 'startDate' })

  // Move focus into the form when it opens (the button that opened it is gone).
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const setWeekdays = (next: number[]) => setValue('weekdays', next, { shouldDirty: true, shouldValidate: isSubmitted })
  const setSlots = (next: string[]) => setValue('timeSlots', next, { shouldDirty: true, shouldValidate: isSubmitted })

  // ---- Slot grid: tap to toggle, drag to select a range (pointer events: mouse, pen and touch) ----
  const drag = useRef<{ anchor: string; adding: boolean; base: string[]; last: string } | null>(null)
  // Pointer type of the latest press on a slot: mouse/pen presses toggle on pointerdown, touch taps on click.
  const lastPointerType = useRef<string>('')

  useEffect(() => {
    const stop = () => {
      drag.current = null
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const slotAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-slot]')?.dataset.slot

  const onSlotPointerDown = (e: React.PointerEvent<HTMLButtonElement>, slot: string) => {
    lastPointerType.current = e.pointerType
    // Touch taps toggle in onClick; a swipe that scrolls fires pointercancel and no click.
    if (e.pointerType === 'touch') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const base = getValues('timeSlots')
    const adding = !base.includes(slot)
    drag.current = { anchor: slot, adding, base, last: slot }
    setSlots(applySlotDrag(base, slot, slot, adding))
  }

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // The button was released outside the window (no pointerup reached us): stop dragging.
    if (e.buttons === 0) {
      drag.current = null
      return
    }
    const slot = slotAt(e.clientX, e.clientY)
    if (!slot || slot === d.last) return
    d.last = slot
    setSlots(applySlotDrag(d.base, d.anchor, slot, d.adding))
  }

  // Keyboard (Enter/Space) and assistive tech arrive as a click with detail 0; touch taps toggle here too.
  // Mouse/pen clicks were already handled on pointerdown.
  const onSlotClick = (e: React.MouseEvent<HTMLButtonElement>, slot: string) => {
    if (e.detail !== 0 && lastPointerType.current !== 'touch') return
    setSlots(toggleSlot(getValues('timeSlots'), slot))
  }

  // ---- Review and save ----
  const onReview = async (values: SlotRuleFormValues) => {
    const result = validateSlotRuleForm(values)
    if (!result.ok || previewInFlight.current) return // the resolver already showed the errors
    previewInFlight.current = true
    try {
      const overlap = await preview.mutateAsync(result.input)
      if (!overlap.success) {
        toast.error(overlap.error || 'Could not check existing bookings')
        return
      }
      setReview({ input: result.input, overlaps: overlap.bookings, truncated: overlap.truncated })
    } catch {
      toast.error('Could not check existing bookings. Check your connection and that you are still signed in.')
    } finally {
      previewInFlight.current = false
    }
  }

  const onConfirm = async () => {
    if (!review || saveInFlight.current) return
    saveInFlight.current = true
    try {
      const result = initial
        ? await updateRule.mutateAsync({ id: initial.id, input: review.input })
        : await createRule.mutateAsync(review.input)
      if (result.success) {
        toast.success(initial ? 'Rule updated' : 'Rule saved')
        setReview(null)
        onClose()
      } else {
        toast.error(result.error || 'Failed to save the rule')
      }
    } catch {
      toast.error('Failed to save the rule. Check your connection and that you are still signed in.')
    } finally {
      saveInFlight.current = false
    }
  }

  const hasErrors = Object.keys(errors).length > 0
  const errorProps = (id: string, error?: string, hasHint = false) => ({
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hasHint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined,
  })
  const shortcutActive = (days: readonly number[]) =>
    weekdays.length === days.length && days.every((d) => weekdays.includes(d))

  return (
    <form
      onSubmit={handleSubmit(onReview)}
      noValidate
      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xl space-y-6"
      aria-labelledby="slot-rule-form-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id="slot-rule-form-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-900 focus:outline-none"
          >
            {initial ? 'Edit rule' : 'New rule'}
          </h3>
          <p className="text-sm text-gray-500">You&apos;ll see a summary and any affected bookings before saving.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close without saving"
          className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>

      {/* Label */}
      <div className="space-y-1 sm:max-w-sm">
        <Label htmlFor="rule-label" className="text-sm text-gray-700">
          Label (optional)
        </Label>
        <Input
          id="rule-label"
          placeholder="e.g. Open Play"
          maxLength={MAX_RULE_LABEL}
          autoComplete="off"
          {...errorProps('rule-label', errors.label?.message, true)}
          {...register('label')}
        />
        <p id="rule-label-hint" className="text-xs text-gray-500">
          Customers see this on blocked slots. Leave empty to show &ldquo;Blocked&rdquo;. Up to {MAX_RULE_LABEL} characters.
        </p>
        {errors.label?.message && (
          <p id="rule-label-error" className="text-sm text-red-600">
            {errors.label.message}
          </p>
        )}
      </div>

      {/* Days */}
      <fieldset className="space-y-2" aria-describedby={errors.weekdays?.message ? 'rule-weekdays-error' : undefined}>
        <legend className="text-sm font-medium text-gray-700 mb-2">Days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_SHORTCUTS.map((s) => (
            <Button
              key={s.label}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={shortcutActive(s.days)}
              className="aria-pressed:border-emerald-400 aria-pressed:bg-emerald-50 aria-pressed:text-emerald-800"
              onClick={() => setWeekdays([...s.days])}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          {WEEKDAY_SHORT.map((name, i) => {
            const d = i + 1
            const on = weekdays.includes(d)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[i]}
                onClick={() => setWeekdays(toggleWeekday(getValues('weekdays'), d))}
                className={`min-h-10 sm:min-w-14 px-1 sm:px-3 rounded-lg text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  on ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
        {errors.weekdays?.message && (
          <p id="rule-weekdays-error" className="text-sm text-red-600">
            {errors.weekdays.message}
          </p>
        )}
      </fieldset>

      {/* Time slots */}
      <fieldset
        className="space-y-2"
        aria-describedby={`rule-slots-hint${errors.timeSlots?.message ? ' rule-slots-error' : ''}`}
      >
        <legend className="text-sm font-medium text-gray-700 mb-1">Time slots</legend>
        <p id="rule-slots-hint" className="text-xs text-gray-500">
          Tap a slot to pick it, or press and drag across slots to pick a range.
        </p>
        <div
          className="grid grid-cols-3 lg:grid-cols-4 gap-2 touch-pan-y select-none"
          onPointerMove={onGridPointerMove}
        >
          {RULE_SLOTS.map((slot) => {
            const on = timeSlots.includes(slot)
            return (
              <button
                key={slot}
                type="button"
                data-slot={slot}
                aria-pressed={on}
                onPointerDown={(e) => onSlotPointerDown(e, slot)}
                onClick={(e) => onSlotClick(e, slot)}
                className={`min-h-10 px-1 sm:px-2 py-2 rounded-lg text-xs sm:text-sm text-center font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  on ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                {slotLabel(slot)}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <button type="button" className="text-emerald-700 hover:underline" onClick={() => setSlots([...RULE_SLOTS])}>
            Select all
          </button>
          <button type="button" className="text-gray-600 hover:underline" onClick={() => setSlots([])}>
            Clear
          </button>
          <p className="text-gray-600" aria-live="polite">
            {timeSlots.length === 0 ? 'No slots picked' : `Blocks ${describeTimeSlots(timeSlots)}`}
          </p>
        </div>
        {errors.timeSlots?.message && (
          <p id="rule-slots-error" className="text-sm text-red-600">
            {errors.timeSlots.message}
          </p>
        )}
      </fieldset>

      {/* Dates */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="rule-start" className="text-sm text-gray-700">
            Start date
          </Label>
          <Input
            id="rule-start"
            type="date"
            {...errorProps('rule-start', errors.startDate?.message)}
            {...register('startDate', { deps: ['endDate'] })}
          />
          {errors.startDate?.message && (
            <p id="rule-start-error" className="text-sm text-red-600">
              {errors.startDate.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" {...register('noEnd', { deps: ['endDate'] })} />
            No end date
          </label>
          {!noEnd && (
            <div className="space-y-1">
              <Label htmlFor="rule-end" className="text-sm text-gray-700">
                End date (last blocked day)
              </Label>
              <Input
                id="rule-end"
                type="date"
                min={startDate || undefined}
                {...errorProps('rule-end', errors.endDate?.message)}
                {...register('endDate')}
              />
            </div>
          )}
          {errors.endDate?.message && (
            <p id="rule-end-error" className="text-sm text-red-600">
              {errors.endDate.message}
            </p>
          )}
        </div>
      </div>

      {/* Customer visibility */}
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            aria-describedby="rule-hide-hint"
            {...register('hideFromCustomers')}
          />
          Hide these slots from customers
        </label>
        <p id="rule-hide-hint" className="text-xs text-gray-500 pl-6">
          Use for closed hours. Leave off to show the label, e.g. Open Play.
        </p>
      </div>

      {errors.root?.message && <p className="text-sm text-red-600">{errors.root.message}</p>}
      {hasErrors && submitCount > 0 && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          Please fix the highlighted fields above.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={preview.isPending || saving}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
        >
          {preview.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
          ) : (
            <ClipboardCheck className="w-4 h-4 mr-2" aria-hidden />
          )}
          {preview.isPending ? 'Checking bookings…' : 'Review rule'}
        </Button>
      </div>

      <ConfirmationDialog
        open={!!review}
        onClose={() => setReview(null)}
        onConfirm={onConfirm}
        title={initial ? 'Save changes to this rule?' : 'Save this rule?'}
        description={
          review
            ? describeRule({
                label: review.input.label,
                start_date: review.input.startDate,
                end_date: review.input.endDate,
                weekdays: review.input.weekdays,
                time_slots: review.input.timeSlots,
              })
            : ''
        }
        confirmText={initial ? 'Save changes' : 'Save rule'}
        cancelText="Back"
        variant={review && review.overlaps.length > 0 ? 'warning' : 'confirm'}
        isLoading={saving}
      >
        {review && (
          <div className="space-y-2 text-sm text-gray-700">
            <p className="text-gray-600">
              {review.input.hideFromCustomers
                ? 'Hidden from customers: these slots won\'t appear on the booking page.'
                : 'Shown to customers as greyed-out slots with the label.'}
            </p>
            <p className={review.overlaps.length > 0 ? 'font-medium text-amber-800' : 'text-gray-600'}>
              {overlapSummary(review.overlaps.length, review.truncated)}
            </p>
            {initial && reactivatesRule(initial, review.input, manilaNow().date) && (
              <p className="font-medium text-gray-900">This reactivates the rule.</p>
            )}
            {review.truncated && <p className="text-xs text-amber-800">Showing the first {RULE_OVERLAP_LIMIT.toLocaleString('en-US')}.</p>}
            {review.overlaps.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100" aria-label="Existing bookings in these slots">
                {review.overlaps.map((b, i) => (
                  <li key={`${b.shortId ?? 'none'}-${b.date}-${b.timeSlot}-${i}`} className="flex flex-wrap gap-x-2 px-3 py-2">
                    <span className="font-mono text-xs text-gray-900 self-center">{b.shortId ?? 'No ID'}</span>
                    <span>{formatRuleDate(b.date)}</span>
                    <span>{slotLabel(b.timeSlot)}</span>
                    <span className="text-gray-900">{b.name}</span>
                    {b.status === 'pending' && <span className="text-xs text-amber-700 self-center">(payment pending)</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500">
              Existing bookings stay valid. The rule only stops new bookings in these slots.
            </p>
          </div>
        )}
      </ConfirmationDialog>
    </form>
  )
}
