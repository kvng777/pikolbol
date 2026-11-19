import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, getProfileByUserId } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ supabase: { auth: { getUser } } }))
vi.mock('@/lib/profileService', () => ({ getProfileByUserId }))

import { getUserIdFromToken, requireUser, requireAdmin, ActionAuthError } from './actionAuth'

describe('actionAuth', () => {
  beforeEach(() => {
    getUser.mockReset()
    getProfileByUserId.mockReset()
  })

  it('getUserIdFromToken returns null for an empty token without calling Supabase', async () => {
    expect(await getUserIdFromToken('')).toBeNull()
    expect(await getUserIdFromToken(null)).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('getUserIdFromToken returns null when Supabase rejects the token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') })
    expect(await getUserIdFromToken('nope')).toBeNull()
  })

  it('requireUser returns the user id for a valid token', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await requireUser('ok')).toBe('u1')
    expect(getUser).toHaveBeenCalledWith('ok')
  })

  it('requireUser throws unauthorized without a token', async () => {
    await expect(requireUser('')).rejects.toBeInstanceOf(ActionAuthError)
    await expect(requireUser('')).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('requireAdmin throws forbidden for a non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'user' })
    await expect(requireAdmin('ok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('requireAdmin throws forbidden when the profile is missing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getProfileByUserId.mockResolvedValue(null)
    await expect(requireAdmin('ok')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('requireAdmin returns the admin user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getProfileByUserId.mockResolvedValue({ role: 'admin' })
    expect(await requireAdmin('ok')).toBe('admin-1')
  })
})
