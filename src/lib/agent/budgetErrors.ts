import { APICallError } from 'ai'

export type BudgetErrorKind = 'exceeded' | 'unavailable'

/**
 * Classifies a chat request error from the budget gate:
 * 402 → budget reached; 503 with `budget_unavailable` → usage couldn't be checked.
 * The chat transport throws APICallError with statusCode and the response body as message;
 * the body text is only used as a fallback when no status code is available.
 */
export function budgetErrorKind(error: Error | undefined): BudgetErrorKind | null {
  if (!error) return null
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    if (error.statusCode === 402) return 'exceeded'
    if (error.statusCode === 503 && error.message.includes('budget_unavailable')) return 'unavailable'
    return null
  }
  if (error.message.includes('budget_exceeded')) return 'exceeded'
  if (error.message.includes('budget_unavailable')) return 'unavailable'
  return null
}
