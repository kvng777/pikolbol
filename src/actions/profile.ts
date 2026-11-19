'use server'

import { getProfileByUserId, upsertProfile } from '@/lib/profileService'
import { ProfileResult, UpdateProfileData, UserRole } from '@/types/profile'
import { getUserIdFromToken, requireUser } from '@/lib/actionAuth'

export interface IsAdminResult {
  isAdmin: boolean
  role: UserRole | null
}

/**
 * Role of the signed-in caller (false/null when signed out)
 */
export async function isCurrentUserAdminAction(accessToken: string): Promise<IsAdminResult> {
  try {
    const userId = await getUserIdFromToken(accessToken)
    if (!userId) return { isAdmin: false, role: null }

    const profile = await getProfileByUserId(userId)
    if (!profile) return { isAdmin: false, role: null }

    return { isAdmin: profile.role === 'admin', role: profile.role }
  } catch (error) {
    console.error('Error in isCurrentUserAdminAction:', error)
    return { isAdmin: false, role: null }
  }
}

export async function getMyProfileAction(accessToken: string): Promise<ProfileResult> {
  const userId = await requireUser(accessToken)
  try {
    const profile = await getProfileByUserId(userId)

    if (!profile) {
      return { success: false, error: 'Profile not found' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in getMyProfileAction:', error)
    return { success: false, error: 'Failed to fetch profile' }
  }
}

const MAX_NAME_LENGTH = 100
const MAX_PHONE_LENGTH = 20

/**
 * Build the service payload from name/phone only (never role or other keys).
 * Returns null when a present field is not a string or is too long.
 */
function parseProfileInput(data: unknown): UpdateProfileData | null {
  if (typeof data !== 'object' || data === null) return null
  const input = data as Record<string, unknown>
  const payload: UpdateProfileData = {}

  for (const [key, max] of [['name', MAX_NAME_LENGTH], ['phone', MAX_PHONE_LENGTH]] as const) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed.length > max) return null
    payload[key] = trimmed
  }

  return payload
}

export async function upsertMyProfileAction(
  accessToken: string,
  data: UpdateProfileData
): Promise<ProfileResult> {
  const userId = await requireUser(accessToken)
  const payload = parseProfileInput(data)
  if (!payload) {
    return { success: false, error: 'Invalid profile details' }
  }
  try {
    const profile = await upsertProfile(userId, payload)

    if (!profile) {
      return { success: false, error: 'Failed to save profile' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in upsertMyProfileAction:', error)
    return { success: false, error: 'Failed to save profile' }
  }
}
