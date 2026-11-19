'use client'

import { useMemo, useRef, useState } from 'react'
import { useForm, useWatch, get, type FieldErrors, type Resolver } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { Tag, Loader2, CalendarClock, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { toast } from 'sonner'
import { usePricingVersions, useCreatePricingVersion, useCancelPricingVersion } from '@/hooks/usePricing'
import {
  RATE_TIERS,
  RATE_TIER_LABELS,
  SLOT_START_HOURS,
  SLOT_COUNT,
  describeTierHours,
  diffPricingRules,
  formatHour,
  formatPeso,
  maxPricingEffectiveFrom,
  pickPricingVersion,
  upcomingPricingVersions,
  type PricingChange,
} from '@/lib/pricing'
import {
  addDaysIso,
  formRulesToRules,
  initialPricingFormValues,
  nestFieldErrors,
  validatePricingForm,
  type PricingFormValues,
} from '@/lib/pricingForm'
import { manilaNow } from '@/lib/agent/dates'
import type { CreatePricingInput, PricingRules, PricingVersion, RateTier } from '@/types/pricing'

const formatDate = (d: string) => format(parseISO(d), 'MMM d, yyyy')
const SEED_EFFECTIVE_FROM = '2000-01-01'

const TIER_STYLES: Record<RateTier, string> = {
  daytime: 'border-amber-200 bg-amber-50',
  offpeak: 'border-sky-200 bg-sky-50',
  latenight: 'border-indigo-200 bg-indigo-50',
}

// Same validation as the server (createPricingVersionSchema), shown inline before submit.
const pricingResolver: Resolver<PricingFormValues> = async (values) => {
  const result = validatePricingForm(values, manilaNow().date)
  if (result.ok) return { values, errors: {} }
  return { values: {}, errors: nestFieldErrors(result.errors) as FieldErrors<PricingFormValues> }
}

interface PendingChange {
  /** Client's best guess of the start date (used for comparing and display; the server decides "today"). */
  effectiveFrom: string
  /** What is sent to the server. */
  input: CreatePricingInput
  rules: PricingRules
  changes: PricingChange[]
  /** Scheduled versions that start on/after this one and will still take over on their date. */
  laterVersions: PricingVersion[]
}

function TierSummary({ rules }: { rules: PricingRules }) {
  const hours = describeTierHours(rules)
  return (
    <ul className="space-y-1 text-sm">
      {RATE_TIERS.map((t) => (
        <li key={t} className="flex flex-wrap gap-x-2">
          <span className="font-medium text-gray-900">
            {RATE_TIER_LABELS[t]} {formatPeso(rules.tier_prices[t])}/hr
          </span>
          <span className="text-gray-500">{hours[t] || 'no hours'}</span>
        </li>
      ))}
    </ul>
  )
}

function RulesDetails({ rules }: { rules: PricingRules }) {
  return (
    <div className="space-y-2">
      <TierSummary rules={rules} />
      <p className="text-sm text-gray-600">
        {rules.base_players_included} players included, {formatPeso(rules.extra_player_charge)} per extra player ·
        Paddle {formatPeso(rules.paddle_price)} · Ball set {formatPeso(rules.ball_set_price)} · Training balls{' '}
        {formatPeso(rules.training_balls_price)}
        {rules.equipment_charge_start_date
          ? ` (charged for play dates from ${formatDate(rules.equipment_charge_start_date)})`
          : ''}{' '}
        · Cancellation fee {formatPeso(rules.cancellation_fee_per_slot)}/slot within {rules.cancellation_window_hours}h
      </p>
    </div>
  )
}

export function PricingSettings() {
  const { data: versions, isLoading, isError, refetch } = usePricingVersions()
  const createVersion = useCreatePricingVersion()
  const cancelVersion = useCancelPricingVersion()

  const today = manilaNow().date
  const tomorrow = addDaysIso(today, 1)
  const maxDate = maxPricingEffectiveFrom(today)
  const current = versions ? pickPricingVersion(versions, today) : null
  const upcoming = versions ? upcomingPricingVersions(versions, today) : []
  // Same-date ties list newest first, so a later entry with an already-seen date is replaced.
  const supersededIds = new Set(upcoming.filter((v, i) => upcoming.findIndex((u) => u.effective_from === v.effective_from) < i).map((v) => v.id))

  const [pending, setPending] = useState<PendingChange | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PricingVersion | null>(null)
  // Synchronous guards: a fast double click can fire twice before `isPending` re-renders.
  const confirmInFlight = useRef(false)
  const cancelInFlight = useRef(false)

  // Prefill from the version in effect. react-hook-form only resets the form when these
  // values actually change (deep compare), so background refetches don't wipe edits.
  const prefill = current ? initialPricingFormValues(current.rules, today) : undefined

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, submitCount },
  } = useForm<PricingFormValues>({
    resolver: pricingResolver,
    mode: 'onTouched',
    values: prefill,
    // If prices change in the background (e.g. another admin), keep fields this admin edited.
    resetOptions: { keepDirtyValues: true },
  })
  const mode = useWatch({ control, name: 'mode' })
  const watchedRules = useWatch({ control, name: 'rules' })

  const liveRules = useMemo(() => {
    if (!watchedRules?.hour_tiers || watchedRules.hour_tiers.length !== SLOT_COUNT) return null
    if (!watchedRules.hour_tiers.every((t) => RATE_TIERS.includes(t))) return null
    return formRulesToRules(watchedRules)
  }, [watchedRules])
  const liveTierHours = liveRules ? describeTierHours(liveRules) : null

  const onReview = (values: PricingFormValues) => {
    if (!versions) return
    const now = manilaNow().date
    const result = validatePricingForm(values, now)
    if (!result.ok) return // the resolver already showed the errors
    // Compare with the prices that would otherwise apply on that date.
    const baseline = pickPricingVersion(versions, result.effectiveFrom)
    if (!baseline) {
      toast.error('Prices could not be loaded. Refresh the page and try again.')
      return
    }
    const changes = diffPricingRules(baseline.rules, result.rules)
    if (changes.length === 0) {
      toast.info('Nothing changed: these are already the prices for that date.')
      return
    }
    setPending({
      effectiveFrom: result.effectiveFrom,
      input: result.input,
      rules: result.rules,
      changes,
      laterVersions: upcomingPricingVersions(versions, now).filter((v) => v.effective_from >= result.effectiveFrom),
    })
  }

  const onConfirm = async () => {
    if (!pending || confirmInFlight.current) return
    confirmInFlight.current = true
    try {
      const result = await createVersion.mutateAsync(pending.input)
      if (result.success) {
        // The server decides whether these prices are live (its "today", not this browser's).
        const { appliedNow } = result
        toast.success(
          appliedNow ? 'New prices are live' : `Price change scheduled for ${formatDate(result.version.effective_from)}`
        )
        setPending(null)
        // Scheduled: back to the prices in effect (the change shows in the list above).
        // Applied now: the refetched prices become the new prefill automatically.
        if (!appliedNow && prefill) reset(prefill)
      } else {
        toast.error(result.error || 'Failed to save prices')
      }
    } catch {
      toast.error('Failed to save prices. Check your connection and that you are still signed in.')
    } finally {
      confirmInFlight.current = false
    }
  }

  const onCancelUpcoming = async () => {
    if (!cancelTarget || cancelInFlight.current) return
    cancelInFlight.current = true
    try {
      const result = await cancelVersion.mutateAsync(cancelTarget.id)
      if (result.success) {
        toast.success('Scheduled price change cancelled')
        setCancelTarget(null)
      } else {
        toast.error(result.error || 'Failed to cancel the price change')
      }
    } catch {
      toast.error('Failed to cancel the price change. Check your connection and that you are still signed in.')
    } finally {
      cancelInFlight.current = false
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading prices">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!isError && versions && !current) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700 space-y-3" role="alert">
        <p>
          No prices are in effect today, so new bookings can&apos;t be priced. Prices were loaded fine; none of them
          starts on or before today. Add the missing prices (or check that the starting prices were set up), then try
          again.
        </p>
        <Button type="button" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (isError || !current) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700 space-y-3" role="alert">
        <p>
          Prices could not be loaded, so new bookings can&apos;t be priced until this is fixed. Check that the pricing
          migration was applied.
        </p>
        <Button type="button" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const fieldId = (name: string) => name.replace(/\./g, '-')
  const fieldError = (name: string): string | undefined => get(errors, name)?.message

  const numberField = (
    name: Parameters<typeof register>[0],
    label: string,
    opts: { peso?: boolean; hint?: string } = {}
  ) => {
    const id = fieldId(name)
    const error = fieldError(name)
    const describedBy = [opts.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm text-gray-700">
          {label}
        </Label>
        <div className="relative">
          {opts.peso && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500" aria-hidden>
              ₱
            </span>
          )}
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={opts.peso ? 'pl-7' : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            {...register(name, { valueAsNumber: true })}
          />
        </div>
        {opts.hint && (
          <p id={`${id}-hint`} className="text-xs text-gray-500">
            {opts.hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    )
  }

  const hasErrors = Object.keys(errors).length > 0
  const equipmentDateError = fieldError('rules.equipment_charge_start_date')
  const effectiveFromError = fieldError('effectiveFrom')

  return (
    <div className="space-y-6">
      {/* Current + upcoming */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6" aria-labelledby="pricing-current-heading">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-100 shrink-0">
            <Tag className="w-5 h-5 text-emerald-600" aria-hidden />
          </div>
          <div>
            <h3 id="pricing-current-heading" className="font-semibold text-gray-900">
              Prices
            </h3>
            <p className="text-sm text-gray-500">
              Prices apply by play date. Existing bookings always keep the amount they were charged.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-medium text-emerald-800 mb-2">
            In effect now
            {current.effective_from > SEED_EFFECTIVE_FROM && <> (play dates from {formatDate(current.effective_from)})</>}
          </p>
          <RulesDetails rules={current.rules} />
        </div>

        <h4 className="mt-6 mb-2 text-sm font-medium text-gray-900">Scheduled changes</h4>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">None scheduled.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((v) => (
              <li
                key={v.id}
                className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-2 min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
                    <CalendarClock className="w-4 h-4 shrink-0" aria-hidden />
                    For play dates from {formatDate(v.effective_from)}
                  </p>
                  {supersededIds.has(v.id) && (
                    <p className="text-xs text-amber-800">Replaced by a later change for the same date</p>
                  )}
                  <RulesDetails rules={v.rules} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
                  disabled={cancelVersion.isPending}
                  onClick={() => setCancelTarget(v)}
                  aria-label={`Cancel the price change for ${formatDate(v.effective_from)}`}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Editor */}
      <form
        onSubmit={handleSubmit(onReview)}
        noValidate
        className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-8"
        aria-labelledby="pricing-edit-heading"
      >
        <div>
          <h3 id="pricing-edit-heading" className="font-semibold text-gray-900">
            Change prices
          </h3>
          <p className="text-sm text-gray-500">
            Prefilled with the prices in effect now. You&apos;ll see a summary of the changes before anything is saved.
          </p>
        </div>

        <section className="space-y-3" aria-labelledby="pricing-rates-heading">
          <h4 id="pricing-rates-heading" className="font-medium text-gray-900">
            Court rates (per 1-hour slot)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {RATE_TIERS.map((t) => (
              <div key={t}>
                {numberField(`rules.tier_prices.${t}`, RATE_TIER_LABELS[t], {
                  peso: true,
                  hint: liveTierHours ? liveTierHours[t] || 'Not used by any hour' : undefined,
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="pricing-hours-heading">
          <div>
            <h4 id="pricing-hours-heading" className="font-medium text-gray-900">
              Rate for each hour
            </h4>
            <p className="text-sm text-gray-500">Choose which rate each 1-hour slot uses.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SLOT_START_HOURS.map((hour, i) => {
              const id = `rules-hour_tiers-${i}`
              const tier = watchedRules?.hour_tiers?.[i]
              return (
                <div
                  key={hour}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    tier && TIER_STYLES[tier] ? TIER_STYLES[tier] : 'border-gray-200'
                  }`}
                >
                  <label htmlFor={id} className="text-gray-800 whitespace-nowrap">
                    {formatHour(hour)} – {formatHour(hour + 1)}
                  </label>
                  <select
                    id={id}
                    className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    {...register(`rules.hour_tiers.${i}`)}
                  >
                    {RATE_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {RATE_TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          {fieldError('rules.hour_tiers') && <p className="text-sm text-red-600">{fieldError('rules.hour_tiers')}</p>}
        </section>

        <section className="space-y-3" aria-labelledby="pricing-players-heading">
          <h4 id="pricing-players-heading" className="font-medium text-gray-900">
            Players
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {numberField('rules.base_players_included', 'Players included in the slot rate')}
            {numberField('rules.extra_player_charge', 'Charge per extra player', { peso: true })}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="pricing-equipment-heading">
          <h4 id="pricing-equipment-heading" className="font-medium text-gray-900">
            Equipment (per booking)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {numberField('rules.paddle_price', 'Paddle (each)', { peso: true })}
            {numberField('rules.ball_set_price', 'Ball set', { peso: true })}
            {numberField('rules.training_balls_price', 'Training balls', { peso: true })}
          </div>
          <div className="space-y-1 sm:max-w-xs">
            <Label htmlFor="rules-equipment_charge_start_date" className="text-sm text-gray-700">
              Charge equipment for play dates from
            </Label>
            <Input
              id="rules-equipment_charge_start_date"
              type="date"
              aria-invalid={equipmentDateError ? true : undefined}
              aria-describedby={`rules-equipment_charge_start_date-hint${equipmentDateError ? ' rules-equipment_charge_start_date-error' : ''}`}
              {...register('rules.equipment_charge_start_date')}
            />
            <p id="rules-equipment_charge_start_date-hint" className="text-xs text-gray-500">
              Leave empty to always charge for equipment.
            </p>
            {equipmentDateError && (
              <p id="rules-equipment_charge_start_date-error" className="text-sm text-red-600">
                {equipmentDateError}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="pricing-cancel-heading">
          <h4 id="pricing-cancel-heading" className="font-medium text-gray-900">
            Cancellation
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {numberField('rules.cancellation_window_hours', 'Free cancellation until (hours before play)')}
            {numberField('rules.cancellation_fee_per_slot', 'Fee per slot when cancelling later', {
              peso: true,
              hint: 'Cannot be more than the highest slot rate.',
            })}
          </div>
        </section>

        <fieldset className="space-y-3 border-t border-gray-100 pt-6">
          <legend className="font-medium text-gray-900 mb-3">When should these prices apply?</legend>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
            <input type="radio" value="now" className="mt-0.5 h-4 w-4 accent-emerald-600" {...register('mode')} />
            <span>
              <span className="font-medium text-gray-900">Apply now</span>
              <span className="block text-gray-500">New bookings for play dates from today ({formatDate(today)}).</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
            <input type="radio" value="scheduled" className="mt-0.5 h-4 w-4 accent-emerald-600" {...register('mode')} />
            <span>
              <span className="font-medium text-gray-900">Schedule for a date</span>
              <span className="block text-gray-500">New bookings for play dates from the date you pick (tomorrow or later).</span>
            </span>
          </label>
          {mode === 'scheduled' && (
            <div className="space-y-1 sm:max-w-xs">
              <Label htmlFor="effectiveFrom" className="text-sm text-gray-700">
                First play date with the new prices
              </Label>
              <Input
                id="effectiveFrom"
                type="date"
                min={tomorrow}
                max={maxDate}
                aria-invalid={effectiveFromError ? true : undefined}
                aria-describedby={effectiveFromError ? 'effectiveFrom-error' : undefined}
                {...register('effectiveFrom')}
              />
              {effectiveFromError && (
                <p id="effectiveFrom-error" className="text-sm text-red-600">
                  {effectiveFromError}
                </p>
              )}
            </div>
          )}
        </fieldset>

        {hasErrors && submitCount > 0 && (
          <p role="alert" className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            Please fix the highlighted fields above.
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => prefill && reset(prefill)}>
            Reset to current prices
          </Button>
          <Button
            type="submit"
            disabled={createVersion.isPending}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
          >
            <ClipboardCheck className="w-4 h-4 mr-2" aria-hidden />
            Review changes
          </Button>
        </div>
      </form>

      {/* Save confirmation */}
      <ConfirmationDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={onConfirm}
        title={pending?.input.mode === 'now' ? 'Apply new prices now?' : 'Schedule new prices?'}
        description={
          pending
            ? `Applies to new bookings for play dates from ${pending.input.mode === 'now' ? `today (${formatDate(pending.effectiveFrom)})` : formatDate(pending.effectiveFrom)}; existing bookings keep their price.`
            : ''
        }
        confirmText={pending?.input.mode === 'now' ? 'Apply now' : 'Schedule'}
        cancelText="Back"
        variant="confirm"
        isLoading={createVersion.isPending}
      >
        {pending && (
          <div className="space-y-3">
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <caption className="sr-only">Price changes, old and new values</caption>
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Item</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Old</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">New</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.changes.map((c) => (
                    <tr key={c.label} className="border-t border-gray-100">
                      <th scope="row" className="px-3 py-2 text-left font-normal text-gray-700">{c.label}</th>
                      <td className="px-3 py-2 text-gray-500 line-through">{c.from}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              Customers already on the payment screen keep the price they were shown.
            </p>
            {pending.laterVersions.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {pending.laterVersions.some((v) => v.effective_from === pending.effectiveFrom)
                  ? 'A change is already scheduled for this same date. This new one will take priority; cancel the older one if it is no longer needed. '
                  : ''}
                {pending.laterVersions
                  .filter((v) => v.effective_from > pending.effectiveFrom)
                  .map((v) => `The change scheduled for ${formatDate(v.effective_from)} will still replace these prices from that date.`)
                  .join(' ')}
              </p>
            )}
          </div>
        )}
      </ConfirmationDialog>

      {/* Cancel confirmation */}
      <ConfirmationDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={onCancelUpcoming}
        title="Cancel scheduled price change?"
        description={
          cancelTarget
            ? `The prices scheduled for play dates from ${formatDate(cancelTarget.effective_from)} will not take effect. The prices that apply before that date stay as they are.`
            : ''
        }
        confirmText="Cancel change"
        cancelText="Keep it"
        variant="danger"
        isLoading={cancelVersion.isPending}
      />
    </div>
  )
}
