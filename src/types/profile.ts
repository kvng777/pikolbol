export type UserRole = 'user' | 'admin'

export interface Profile {
  id: string
  user_id: string
  name: string | null
  phone: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface ProfileFormData {
  name: string
  phone: string
}

export interface CreateProfileData {
  user_id: string
  name?: string
  phone?: string
}

export interface UpdateProfileData {
  name?: string
  phone?: string
}

export interface ProfileResult {
  success: boolean
  error?: string
  profile?: Profile
}
