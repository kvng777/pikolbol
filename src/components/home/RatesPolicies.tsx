'use client'

import { useMemo, type CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import { Sun, Moon, Stars, CalendarX2, UserX, Package, Clock, RefreshCw, CalendarClock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePricingVersions } from '@/hooks/usePricing'
import { describeTierHours, pickPricingVersion, upcomingPricingVersions, diffPricingRules, formatPeso, RATE_TIERS, RATE_TIER_LABELS } from '@/lib/pricing'
import { useSlotRules } from '@/hooks/useSlotRules'
import { permanentlyHiddenSlots } from '@/lib/slotRules'
import { manilaNow } from '@/lib/agent/dates'
import type { PricingRules, RateTier } from '@/types/pricing'

const TIER_CARDS: { tier: RateTier; title: string; icon: LucideIcon; gradient: string; iconClass: string; iconStyle: CSSProperties }[] = [
  { tier: 'daytime', title: 'Daytime Rate', icon: Sun, gradient: 'from-emerald-500 to-teal-600', iconClass: 'animate-spin', iconStyle: { animationDuration: '6s' } },
  { tier: 'offpeak', title: 'Off-Peak Rate', icon: Moon, gradient: 'from-emerald-600 to-teal-700', iconClass: 'animate-pulse', iconStyle: { animationDuration: '3s' } },
  { tier: 'latenight', title: 'Evening Rate', icon: Stars, gradient: 'from-emerald-700 to-teal-900', iconClass: 'animate-pulse', iconStyle: { animationDuration: '3s' } },
]

const formatDate = (d: string) => format(parseISO(d), 'MMMM d, yyyy')

/**
 * Banner wording. When slot prices or hours change, list each tier the next version uses with its
 * price and hours (so a customer sees e.g. that 6–10 PM moved to the evening rate); otherwise a short summary.
 */
function describeNextRates(current: PricingRules | undefined, next: PricingRules, hiddenHours: ReadonlySet<number>): { title: string; lines: string[] } {
  const usedTiers = RATE_TIERS.filter((t) => next.hour_tiers.includes(t))
  const ratesChanged =
    !current ||
    usedTiers.some((t) => current.tier_prices[t] !== next.tier_prices[t]) ||
    current.hour_tiers.some((t, i) => t !== next.hour_tiers[i])
  if (ratesChanged) {
    const hours = describeTierHours(next, hiddenHours)
    return {
      title: 'New rates for play dates from',
      lines: usedTiers.filter((t) => hours[t]).map((t) => `${RATE_TIER_LABELS[t]} ${formatPeso(next.tier_prices[t])}/hr (${hours[t]})`),
    }
  }
  const labels = diffPricingRules(current, next).map((c) => c.label)
  const shown = labels.slice(0, 3).join(', ')
  return {
    title: 'Updated rates from',
    lines: [labels.length === 0 ? 'Rates and policies are updated.' : `Changes to: ${shown}${labels.length > 3 ? ' and more' : ''}.`],
  }
}

export default function RatesPolicies() {
  const { data: versions, isError } = usePricingVersions()
  const today = manilaNow().date
  const current = versions ? pickPricingVersion(versions, today) : null
  // The version that will actually apply on the first upcoming date (newest wins a same-date tie).
  const nextDate = versions ? upcomingPricingVersions(versions, today)[0]?.effective_from : undefined
  const next = versions && nextDate ? pickPricingVersion(versions, nextDate) : null
  // Informational only: if slot rules fail to load, show all hours (booking fails closed elsewhere).
  const { data: slotRules } = useSlotRules()
  const hiddenHours = useMemo(() => permanentlyHiddenSlots(slotRules ?? [], today), [slotRules, today])
  const nextBanner = next ? describeNextRates(current?.rules, next.rules, hiddenHours) : null
  const rules = current?.rules
  // Loaded but nothing in effect is also "unavailable": never invent a price.
  const unavailable = isError || (!!versions && !current)
  const tierHours = rules ? describeTierHours(rules, hiddenHours) : null
  const amount = (n: number | undefined) => (n === undefined ? (unavailable ? '—' : '…') : n.toLocaleString())
  const equipmentStart = rules?.equipment_charge_start_date

  return (
    <section id="rates" className="mb-12">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Rates & Policies</h2>

        {unavailable && (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            Prices unavailable
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Column - Rates + Equipment */}
          <div className="flex flex-col space-y-4 h-full">
            {next && nextBanner && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
                <CalendarClock className="w-5 h-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">{nextBanner.title} {formatDate(next.effective_from)}:</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {nextBanner.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {TIER_CARDS.filter(({ tier }) => !tierHours || tierHours[tier]).map(({ tier, title, icon: Icon, gradient, iconClass, iconStyle }) => (
              <div key={tier} className="rounded-2xl overflow-hidden shadow-lg flex flex-col flex-1">
                <div className={`bg-gradient-to-br ${gradient} p-5 text-white flex-1 flex items-center`}>
                  <div className="flex gap-4 items-center w-full">
                    <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center shrink-0 w-16 h-16">
                      <Icon className={`w-10 h-10 ${iconClass}`} style={iconStyle} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold">{title}</h3>
                      {tierHours && <p className="text-white/80 text-sm">({tierHours[tier]})</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm">Php</span>
                      <span className="text-4xl font-bold ml-1">{amount(rules?.tier_prices[tier])}</span>
                      <span className="text-lg">/hr</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Equipment Rental Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-emerald-50 rounded-full flex items-center justify-center h-11 w-11 shrink-0">
                  <Package className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Equipment Rental</h3>
                  {equipmentStart && equipmentStart > today && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Effective {formatDate(equipmentStart)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.paddle_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Paddle <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.ball_set_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Balls, set of 4 <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php{amount(rules?.training_balls_price)}</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Training balls, set of 50 <span className="text-gray-500">(per booking, w/ movable basket)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Policy Cards */}
          <div className="space-y-4 h-full">
            {/* Cancellation & Rescheduling Policy Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm flex flex-col justify-center">
              {/* Cancellation */}
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-emerald-50 rounded-full mb-3 flex items-center justify-center h-14 w-14">
                  <CalendarX2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Cancellation Policy</h3>
                <ul className="text-gray-700 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-600">Free</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancel {amount(rules?.cancellation_window_hours)} hours before booking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-amber-600">Php{amount(rules?.cancellation_fee_per_slot)}/hour</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancellation within {amount(rules?.cancellation_window_hours)} hours</span>
                  </li>
                </ul>
              </div>

              <hr className="my-4 border-emerald-100" />

              {/* Rescheduling */}
              <div className="flex flex-col items-center text-center">
                <div className="p-2 bg-emerald-50 rounded-full mb-2 flex items-center justify-center h-10 w-10">
                  <RefreshCw className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">Rescheduling Policy</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Rescheduling is only allowed in cases of rain, severe weather, or force majeure events. No rescheduling for personal reasons or no-shows.
                </p>
              </div>
            </div>

            {/* Bottom Row - Two Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* No-Show Policy Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <UserX className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">No-Show Policy</h3>
                  <p className="text-gray-600 text-sm">Full fee will be charged</p>
                </div>
              </div>

              {/* Other Equipment Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <Package className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Other Equipment</h3>
                  <p className="text-gray-600 text-sm">Charged separately upon request</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          Prices and policies are subject to change. For group bookings or special requests, please contact us.
        </p>
      </div>
    </section>
  )
}
