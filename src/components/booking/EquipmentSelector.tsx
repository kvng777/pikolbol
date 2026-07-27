'use client'

import { Minus, Plus, Volleyball, ShoppingBasket } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { PADDLE_PRICE, BALL_SET_PRICE, TRAINING_BALLS_PRICE, MAX_PADDLES } from '@/lib/paymentConfig'

interface EquipmentSelectorProps {
  paddles: number
  needsBalls: boolean
  trainingBalls: boolean
  onPaddlesChange: (value: number) => void
  onNeedsBallsChange: (value: boolean) => void
  onTrainingBallsChange: (value: boolean) => void
  /** Whether equipment is currently chargeable (post-promo). Drives the price labels. */
  chargeable: boolean
}

/**
 * Inline paddle icon — lucide-react has no paddle/racquet glyph, so this mirrors
 * the lucide stroke style (24x24, stroke-2, rounded caps).
 */
function PaddleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 528 1050" className={className}>
      <path d="M 218 980 L 213 1019 L 215 1026 L 224 1036 L 238 1041 L 288 1041 L 301 1036 L 309 1027 L 311 1016 L 305 979 Z" fill="black"/><path d="M 219 755 L 219 972 L 304 971 L 304 755 Z" fill="black"/><path d="M 133 40 L 145 38 L 378 38 L 399 42 L 430 56 L 457 80 L 474 107 L 482 133 L 483 504 L 475 539 L 462 564 L 447 580 L 426 594 L 372 613 L 345 629 L 313 658 L 284 693 L 236 693 L 207 657 L 176 628 L 147 612 L 110 600 L 86 588 L 63 567 L 49 543 L 43 523 L 40 501 L 41 137 L 49 109 L 56 95 L 71 75 L 85 62 L 104 50 Z" fill="black"/><path d="M 113 18 L 143 12 L 381 12 L 395 14 L 426 24 L 458 44 L 484 72 L 494 88 L 504 113 L 510 147 L 510 499 L 503 538 L 490 569 L 478 586 L 465 599 L 432 620 L 392 633 L 370 644 L 336 671 L 313 697 L 290 696 L 289 694 L 308 671 L 348 633 L 375 617 L 422 601 L 449 585 L 468 564 L 483 530 L 488 503 L 488 142 L 483 117 L 467 85 L 444 60 L 428 49 L 409 40 L 375 33 L 148 33 L 129 36 L 101 46 L 75 64 L 58 83 L 44 108 L 36 138 L 36 510 L 41 535 L 48 553 L 56 566 L 79 589 L 99 601 L 144 616 L 162 625 L 183 640 L 204 661 L 231 694 L 230 696 L 210 697 L 178 663 L 154 645 L 129 633 L 85 618 L 54 596 L 33 570 L 22 546 L 16 521 L 14 505 L 14 143 L 16 128 L 22 106 L 32 84 L 52 57 L 81 33 Z" fill="black"/><path d="M 119 6 L 98 13 L 75 25 L 56 39 L 41 54 L 24 78 L 12 104 L 7 122 L 4 144 L 4 504 L 10 540 L 16 558 L 27 579 L 39 595 L 56 611 L 85 629 L 125 642 L 151 655 L 188 687 L 199 700 L 197 706 L 207 745 L 226 748 L 313 747 L 319 743 L 326 709 L 326 702 L 324 700 L 352 670 L 376 652 L 396 642 L 434 630 L 452 621 L 469 609 L 486 592 L 496 578 L 512 542 L 519 508 L 519 137 L 515 115 L 502 82 L 479 50 L 449 25 L 428 14 L 408 7 L 380 2 L 143 2 Z" fill="black"/>
    </svg>
  )
}

/**
 * Paddle stepper + balls toggle + training-balls toggle.
 * Shared by the public booking form and the admin manual-booking form.
 */
export function EquipmentSelector({
  paddles,
  needsBalls,
  trainingBalls,
  onPaddlesChange,
  onNeedsBallsChange,
  onTrainingBallsChange,
  chargeable,
}: EquipmentSelectorProps) {
  const paddleLabel = chargeable ? `Php${PADDLE_PRICE} each` : 'FREE (promo)'
  const ballLabel = chargeable ? `Php${BALL_SET_PRICE} / set of 4` : 'FREE (promo)'
  const trainingBallsLabel = chargeable
    ? `Php${TRAINING_BALLS_PRICE} / booking · with movable basket`
    : 'FREE (promo) · with movable basket'

  const adjustPaddles = (delta: number) => {
    onPaddlesChange(Math.min(MAX_PADDLES, Math.max(0, paddles + delta)))
  }

  return (
    <div className="space-y-3">
      <Label className="text-gray-700 text-sm">Equipment (optional)</Label>

      {/* Paddles */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2">
          <PaddleIcon className="w-6 h-6 text-gray-500" />
          <div>
            <p className="text-sm font-medium text-gray-900">Paddles</p>
            <p className="text-xs text-gray-500">{paddleLabel}</p>
          </div>
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
          <Volleyball className={`w-4 h-4 ${needsBalls ? 'text-emerald-600' : 'text-gray-400'}`} />
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

      {/* Training Balls */}
      <button
        type="button"
        onClick={() => onTrainingBallsChange(!trainingBalls)}
        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
          trainingBalls
            ? 'bg-emerald-50 border-emerald-300'
            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-center gap-2 text-left">
          <ShoppingBasket className={`w-4 h-4 ${trainingBalls ? 'text-emerald-600' : 'text-gray-400'}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">Training Balls (set of 50)</p>
            <p className="text-xs text-gray-500">{trainingBallsLabel}</p>
          </div>
        </div>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            trainingBalls ? 'bg-emerald-500' : 'bg-gray-300'
          } after:absolute after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform ${
            trainingBalls ? 'after:translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
