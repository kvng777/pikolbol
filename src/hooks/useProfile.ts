'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyProfileAction, upsertMyProfileAction } from '@/actions/profile'
import { UpdateProfileData } from '@/types/profile'
import { useAuth } from '@/components/AuthProvider'
import { getAccessToken } from '@/lib/accessToken'

const PROFILE_QUERY_KEY = 'profile'

export function useProfile() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: [PROFILE_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return null
      const result = await getMyProfileAction(await getAccessToken())
      if (result.success && result.profile) {
        return result.profile
      }
      return null
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpsertProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id

  return useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      if (!userId) throw new Error('User not authenticated')
      const result = await upsertMyProfileAction(await getAccessToken(), data)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save profile')
      }
      return result.profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY, userId] })
    },
  })
}
