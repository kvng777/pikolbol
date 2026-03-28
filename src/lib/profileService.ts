import { supabase as supabaseServer } from './supabase-server'
import { Profile, CreateProfileData, UpdateProfileData } from '@/types/profile'

export async function getProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No profile found
      return null
    }
    console.error('Error fetching profile:', error)
    return null
  }

  return data
}

export async function createProfile(profileData: CreateProfileData): Promise<Profile | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .insert({
      user_id: profileData.user_id,
      name: profileData.name || null,
      phone: profileData.phone || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating profile:', error)
    return null
  }

  return data
}

export async function updateProfile(userId: string, updates: UpdateProfileData): Promise<Profile | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .update({
      name: updates.name,
      phone: updates.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating profile:', error)
    return null
  }

  return data
}

export async function upsertProfile(userId: string, profileData: UpdateProfileData): Promise<Profile | null> {
  // First try to get existing profile
  const existing = await getProfileByUserId(userId)

  if (existing) {
    // Update existing
    return updateProfile(userId, profileData)
  } else {
    // Create new
    return createProfile({
      user_id: userId,
      name: profileData.name,
      phone: profileData.phone,
    })
  }
}
