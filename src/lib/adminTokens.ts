import { createHmac } from 'crypto'

const SECRET = process.env.ADMIN_ACTION_SECRET || ''

export function generateConfirmToken(bookingGroupId: string): string {
  return createHmac('sha256', SECRET).update(bookingGroupId).digest('hex')
}

export function verifyConfirmToken(bookingGroupId: string, token: string): boolean {
  if (!SECRET) return false
  const expected = generateConfirmToken(bookingGroupId)
  return expected === token
}
