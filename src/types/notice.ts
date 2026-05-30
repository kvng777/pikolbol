// Site notice / announcement stored in the database (single-row config)
export interface Notice {
  id: string
  title: string
  message: string
  is_enabled: boolean
  start_date: string | null // 'YYYY-MM-DD' (PH date) or null for no lower bound
  end_date: string | null   // 'YYYY-MM-DD' (PH date) or null for no upper bound
  created_at: string
  updated_at: string
}

// Data for updating the site notice
export interface UpdateNoticeData {
  title?: string
  message?: string
  is_enabled?: boolean
  start_date?: string | null
  end_date?: string | null
}

// Result type for notice operations
export interface NoticeResult {
  success: boolean
  error?: string
  notice?: Notice
}
