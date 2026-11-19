import type { PricingRules, PricingVersion } from '@/types/pricing'
import { describeTierHours, pickPricingVersion, upcomingPricingVersions } from '@/lib/pricing'

function describeRules(rules: PricingRules): string {
  const hours = describeTierHours(rules)
  const tiers = (
    [
      ['daytime', 'daytime'],
      ['offpeak', 'off-peak'],
      ['latenight', 'late-night'],
    ] as const
  )
    .filter(([tier]) => hours[tier])
    .map(([tier, label]) => `${label} ₱${rules.tier_prices[tier]} (${hours[tier]})`)
    .join('; ')
  const equipmentWhen = rules.equipment_charge_start_date
    ? `charged for play dates from ${rules.equipment_charge_start_date}; free before`
    : 'always charged'

  return [
    `- Rates per slot: ${tiers}.`,
    `- ${rules.base_players_included} players included; +₱${rules.extra_player_charge} per extra player.`,
    `- Equipment per booking (${equipmentWhen}): paddles ₱${rules.paddle_price} each, ball set ₱${rules.ball_set_price}, training balls with basket ₱${rules.training_balls_price}.`,
    `- Cancellations within ${rules.cancellation_window_hours} hours of the slot keep a ₱${rules.cancellation_fee_per_slot}/slot fee.`,
  ].join('\n')
}

/**
 * Per-request pricing context for the assistant (goes after the cache breakpoint).
 * Prices are versioned by PLAY date. Each saved order keeps the amount it was charged.
 * Never includes admin ids (created_by).
 */
export function buildPricingNote(versions: PricingVersion[] | null, today: string): string {
  if (!versions) {
    return 'Pricing note: current prices could not be loaded. Do not quote prices; say pricing is unavailable right now.'
  }
  const current = pickPricingVersion(versions, today)
  if (!current) {
    return 'Pricing note: no price version applies today. Do not quote prices.'
  }

  const parts = [`Pricing note (prices apply by play date; in effect since ${current.effective_from}):`, describeRules(current.rules)]
  for (const next of upcomingPricingVersions(versions, today)) {
    parts.push(`Scheduled change for play dates from ${next.effective_from}:`, describeRules(next.rules))
  }
  return parts.join('\n')
}
