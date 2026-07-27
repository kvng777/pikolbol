'use client'

import { Button } from '@/components/ui/button'
import { LogOut, UserStar } from 'lucide-react'
import type { TableUI } from '@/app/admin/hooks/useAdminTable'

interface AdminHeaderProps {
  table: TableUI
  displayName?: string
}

export default function AdminHeader({ table }: AdminHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <UserStar size={38} />
          Admin dashboard
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={table.handleSignOut} className="text-gray-600">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
