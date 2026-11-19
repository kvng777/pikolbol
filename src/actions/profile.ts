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

export async function upsertMyProfileAction(
  accessToken: string,
  data: UpdateProfileData
): Promise<ProfileResult> {
  const userId = await requireUser(accessToken)
  try {
    const profile = await upsertProfile(userId, data)

    if (!profile) {
      return { success: false, error: 'Failed to save profile' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in upsertMyProfileAction:', error)
    return { success: false, error: 'Failed to save profile' }
  }
}
