import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, getProfileByUserId } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ supabase: { auth: { getUser } } }))
vi.mock('@/lib/profileService', () => ({ getProfileByUserId }))

import { requireAdmin } from './auth'

function req(authorization?: string) {
  return new Request('http://localhost/api/admin/agent', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

describe('requireAdmin', () => {
  beforeEach(() => {
    getUser.mockReset()
    getProfileByUserId.mockReset()
  })

  it('401 without a bearer token', async () => {
    const result = await requireAdmin(req())
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('401 when Supabase rejects the token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') })
    expect(((await requireAdmin(req('Bearer nope'))) as Response).status).toBe(401)
  })

  it('403 for a signed-in non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    expect(((await requireAdmin(req('Bearer ok'))) as Response).status).toBe(403)
  })

  it('returns the admin user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    expect(await requireAdmin(req('Bearer ok'))).toEqual({ userId: 'admin-1' })
    expect(getUser).toHaveBeenCalledWith('ok')
  })
})
