'use client'

import { createClient as _createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = _createClient(supabaseUrl, supabaseAnonKey)

export const createClient = _createClient
export type { SupabaseClient }
