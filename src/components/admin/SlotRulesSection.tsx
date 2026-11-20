'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarRange, Loader2, Pencil, Plus, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { SlotRuleForm } from './SlotRuleForm'
import { useAdminSlotRules, useEndSlotRule, useDeleteSlotRule } from '@/hooks/useSlotRules'
import { describeRuleDates, describeTimeSlots, describeWeekdays, ruleLabel, ruleStatus } from '@/lib/slotRules'
import { canEndRule, deleteRuleDescription, endRuleDescription, ruleStatusText, sortRulesForList } from '@/lib/slotRuleForm'
import { manilaNow } from '@/lib/agent/dates'
import type { SlotRule, SlotRuleStatus } from '@/types/slotRules'

const STATUS_STYLE: Record<SlotRuleStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-blue-100 text-blue-800',
  ended: 'bg-gray-200 text-gray-700',
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function SlotRulesSection() {
  const { data: rules = [], isLoading, isError, refetch } = useAdminSlotRules()
  const endRule = useEndSlotRule()
  const deleteRule = useDeleteSlotRule()
  const [editing, setEditing] = useState<SlotRule | 'new' | null>(null)
  const [pending, setPending] = useState<{ action: 'end' | 'delete'; rule: SlotRule } | null>(null)
  // Synchronous guard: a fast double click can fire twice before `isPending` re-renders.
  const inFlight = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreFocus = useRef(false)
  const today = manilaNow().date

  // After the form closes, put focus back on the list heading (the form's controls are gone).
  useEffect(() => {
    if (editing === null && restoreFocus.current) {
      restoreFocus.current = false
      headingRef.current?.focus()
    }
  }, [editing])

  const closeForm = () => {
    restoreFocus.current = true
    setEditing(null)
  }

  const onConfirm = async () => {
    if (!pending || inFlight.current) return
    inFlight.current = true
    try {
      if (pending.action === 'end') {
        const result = await endRule.mutateAsync(pending.rule.id)
        if (result.success) {
          toast.success(result.deleted ? "Rule removed (it hadn't started yet)" : 'Rule ended')
          setPending(null)
        } else {
          toast.error(result.error || 'Failed to end the rule')
        }
      } else {
        const result = await deleteRule.mutateAsync(pending.rule.id)
        if (result.success) {
          toast.success('Rule deleted')
          setPending(null)
        } else {
          toast.error(result.error || 'Failed to delete the rule')
        }
      }
    } catch {
      toast.error('Something went wrong. Check your connection and that you are still signed in.')
    } finally {
      inFlight.current = false
    }
  }

  if (editing) {
    return <SlotRuleForm initial={editing === 'new' ? null : editing} onClose={closeForm} />
  }

  const sorted = sortRulesForList(rules, today)

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xl" aria-labelledby="slot-rules-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 shrink-0">
            <CalendarRange className="w-5 h-5 text-emerald-600" aria-hidden />
          </div>
          <div>
            <h3 id="slot-rules-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
              Rules
            </h3>
            <p className="text-sm text-gray-500">
              Block slots on a schedule, e.g. open play every morning or a tournament weekend. Existing bookings are never
              cancelled.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setEditing('new')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 self-start"
        >
          <Plus className="w-4 h-4" aria-hidden /> New rule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6" role="status" aria-label="Loading rules">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="text-center py-6 space-y-2" role="alert">
          <p className="text-gray-700">Couldn&apos;t load slot rules.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-gray-500 text-center py-6">No rules yet.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((rule) => {
            const status = ruleStatus(rule, today)
            const name = ruleLabel(rule)
            return (
              <li
                key={rule.id}
                className={`flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between ${
                  status === 'ended' ? 'bg-gray-50 opacity-75' : 'bg-gray-50'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                    <span className="break-words">{name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[status]}`}>{ruleStatusText(rule, today)}</span>
                  </p>
                  <p className="text-sm text-gray-700">
                    {describeTimeSlots(rule.time_slots)} · {capitalize(describeWeekdays(rule.weekdays))}
                  </p>
                  <p className="text-sm text-gray-500">{capitalize(describeRuleDates(rule))}</p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(rule)} aria-label={`Edit rule: ${name}`}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  {canEndRule(rule, today) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPending({ action: 'end', rule })}
                      aria-label={`End rule: ${name}`}
                    >
                      <Square aria-hidden /> End
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPending({ action: 'delete', rule })}
                    aria-label={`Delete rule: ${name}`}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 aria-hidden /> Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmationDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={onConfirm}
        title={pending ? `${pending.action === 'end' ? 'End' : 'Delete'} “${ruleLabel(pending.rule)}”?` : ''}
        description={
          !pending
            ? ''
            : pending.action === 'end'
              ? endRuleDescription(pending.rule, today)
              : deleteRuleDescription(pending.rule, today)
        }
        confirmText={pending?.action === 'end' ? 'End rule' : 'Delete rule'}
        cancelText="Keep it"
        variant="danger"
        isLoading={endRule.isPending || deleteRule.isPending}
      >
        {pending && (
          <p className="text-xs text-gray-500 text-center">
            {describeTimeSlots(pending.rule.time_slots)} · {describeWeekdays(pending.rule.weekdays)} · {describeRuleDates(pending.rule)}
            <br />
            Existing bookings are not affected.
          </p>
        )}
      </ConfirmationDialog>
    </section>
  )
}
