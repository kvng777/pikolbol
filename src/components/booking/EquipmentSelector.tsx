'use client'

import { Minus, Plus, CircleDot } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { PADDLE_PRICE, BALL_SET_PRICE, MAX_PADDLES } from '@/lib/paymentConfig'

interface EquipmentSelectorProps {
  paddles: number
  needsBalls: boolean
  onPaddlesChange: (value: number) => void
  onNeedsBallsChange: (value: boolean) => void
  /** Whether equipment is currently chargeable (post-promo). Drives the price labels. */
  chargeable: boolean
}

/**
 * Paddle quantity stepper + balls toggle.
 * Shared by the public booking form and the admin manual-booking form.
 */
export function EquipmentSelector({
  paddles,
  needsBalls,
  onPaddlesChange,
  onNeedsBallsChange,
  chargeable,
}: EquipmentSelectorProps) {
  const paddleLabel = chargeable ? `Php${PADDLE_PRICE} each` : 'FREE (promo)'
  const ballLabel = chargeable ? `Php${BALL_SET_PRICE} / set of 4` : 'FREE (promo)'

  const adjustPaddles = (delta: number) => {
    onPaddlesChange(Math.min(MAX_PADDLES, Math.max(0, paddles + delta)))
  }

  return (
    <div className="space-y-3">
      <Label className="text-gray-700 text-sm">Equipment (optional)</Label>

      {/* Paddles */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div>
          <p className="text-sm font-medium text-gray-900">Paddles</p>
          <p className="text-xs text-gray-500">{paddleLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => adjustPaddles(-1)}
            disabled={paddles === 0}
            aria-label="Decrease paddles"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-6 text-center text-sm font-semibold text-gray-900">{paddles}</span>
          <button
            type="button"
            onClick={() => adjustPaddles(1)}
            disabled={paddles >= MAX_PADDLES}
            aria-label="Increase paddles"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Balls */}
      <button
        type="button"
        onClick={() => onNeedsBallsChange(!needsBalls)}
        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
          needsBalls
            ? 'bg-emerald-50 border-emerald-300'
            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-center gap-2 text-left">
          <CircleDot className={`w-4 h-4 ${needsBalls ? 'text-emerald-600' : 'text-gray-400'}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">Balls (set of 4)</p>
            <p className="text-xs text-gray-500">{ballLabel}</p>
          </div>
        </div>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            needsBalls ? 'bg-emerald-500' : 'bg-gray-300'
          } after:absolute after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform ${
            needsBalls ? 'after:translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
