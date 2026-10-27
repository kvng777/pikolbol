import { describe, it, expect } from 'vitest'
import { APICallError } from 'ai'
import { budgetErrorKind } from './budgetErrors'

const apiError = (statusCode: number | undefined, body: string) =>
  new APICallError({ message: body, url: '/api/admin/agent', requestBodyValues: undefined, statusCode, responseBody: body })

describe('budgetErrorKind', () => {
  it('detects 402 as exceeded and 503 budget_unavailable as unavailable by status code', () => {
    expect(budgetErrorKind(apiError(402, '{"error":"budget_exceeded"}'))).toBe('exceeded')
    expect(budgetErrorKind(apiError(503, '{"error":"budget_unavailable"}'))).toBe('unavailable')
  })

  it('ignores other API errors, including unrelated 503s', () => {
    expect(budgetErrorKind(apiError(500, 'boom'))).toBeNull()
    expect(budgetErrorKind(apiError(503, 'Service Unavailable'))).toBeNull()
  })

  it('falls back to the body text when no status code is available', () => {
    expect(budgetErrorKind(new Error('{"error":"budget_exceeded","resetsOn":"2026-11-01"}'))).toBe('exceeded')
    expect(budgetErrorKind(new Error('{"error":"budget_unavailable"}'))).toBe('unavailable')
    expect(budgetErrorKind(new Error('network down'))).toBeNull()
    expect(budgetErrorKind(undefined)).toBeNull()
  })
})
