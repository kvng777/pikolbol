'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getAllCourts } from '@/lib/timeSlotGenerator'
import { Building2 } from 'lucide-react'

interface CourtSelectorProps {
  selectedCourt: number
  onSelectCourt: (court: number) => void
}

export function CourtSelector({ selectedCourt, onSelectCourt }: CourtSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-300">Select Court</label>
      <Select
        value={selectedCourt.toString()}
        onValueChange={(value) => value && onSelectCourt(parseInt(value))}
      >
        <SelectTrigger className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <SelectValue placeholder="Select a court" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-gray-900 border-white/10">
          {getAllCourts().map((court) => (
            <SelectItem 
              key={court} 
              value={court.toString()}
              className="text-white focus:bg-emerald-500/20 focus:text-emerald-400"
            >
              Court {court}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
