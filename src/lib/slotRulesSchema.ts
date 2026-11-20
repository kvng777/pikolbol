import { z } from 'zod'
import { isRealDate } from './agent/dates'
import { generateTimeSlots } from './timeSlotGenerator'

export const MAX_RULE_LABEL = 30

const SLOTS = new Set(generateTimeSlots())
const isoDate = z.string().refine(isRealDate, 'Enter a valid date')
const unique = <T,>(values: T[]) => new Set(values).size === values.length

/** Admin input for creating or editing a slot rule (shared by the form and the server). */
export const slotRuleInputSchema = z
  .strictObject({
    label: z
      .string()
      .trim()
      .max(MAX_RULE_LABEL, `Label must be ${MAX_RULE_LABEL} characters or fewer`)
      .nullable()
      .transform((v) => (v ? v : null)),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day')
      .refine(unique, 'Days must be unique'),
    timeSlots: z
      .array(z.string().refine((s) => SLOTS.has(s), 'Unknown time slot'))
      .min(1, 'Pick at least one time slot')
      .refine(unique, 'Time slots must be unique'),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  })
