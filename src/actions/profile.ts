'use server'

import { getProfileByUserId, updateProfile, upsertProfile } from '@/lib/profileService'
import { Profile, ProfileResult, UpdateProfileData, UserRole } from '@/types/profile'

export interface IsAdminResult {
  isAdmin: boolean
  role: UserRole | null
}

/**
 * Check if a user has admin role
 */
export async function isUserAdminAction(userId: string): Promise<IsAdminResult> {
  try {
    const profile = await getProfileByUserId(userId)
    
    if (!profile) {
      return { isAdmin: false, role: null }
    }

    return { 
      isAdmin: profile.role === 'admin', 
      role: profile.role 
    }
  } catch (error) {
    console.error('Error in isUserAdminAction:', error)
    return { isAdmin: false, role: null }
  }
}

export async function getProfileAction(userId: string): Promise<ProfileResult> {
  try {
    const profile = await getProfileByUserId(userId)
    
    if (!profile) {
      return { success: false, error: 'Profile not found' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in getProfileAction:', error)
    return { success: false, error: 'Failed to fetch profile' }
  }
}

export async function updateProfileAction(
  userId: string,
  data: UpdateProfileData
): Promise<ProfileResult> {
  try {
    const profile = await updateProfile(userId, data)
    
    if (!profile) {
      return { success: false, error: 'Failed to update profile' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in updateProfileAction:', error)
    return { success: false, error: 'Failed to update profile' }
  }
}

export async function upsertProfileAction(
  userId: string,
  data: UpdateProfileData
): Promise<ProfileResult> {
  try {
    const profile = await upsertProfile(userId, data)
    
    if (!profile) {
      return { success: false, error: 'Failed to save profile' }
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error in upsertProfileAction:', error)
    return { success: false, error: 'Failed to save profile' }
  }
}
