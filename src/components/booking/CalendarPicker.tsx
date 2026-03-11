'use client'

import { useState, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import 'react-day-picker/style.css'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarPickerProps {
  selected: Date
  onSelect: (date: Date) => void
}

export function CalendarPicker({ selected, onSelect }: CalendarPickerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (!mounted) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-[260px] h-[300px] bg-gray-100 animate-pulse rounded-lg" />
        <p className="text-sm text-gray-400 mt-3">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(date) => date && onSelect(date)}
        fromDate={today}
        className="!font-sans"
        components={{
          Chevron: ({ orientation }) => 
            orientation === 'left' 
              ? <ChevronLeft className="w-5 h-5 text-emerald-600" />
              : <ChevronRight className="w-5 h-5 text-emerald-600" />
        }}
        styles={{
          months: { display: 'flex', flexDirection: 'column', gap: '1rem' },
          month: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
          caption: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
          caption_label: { color: '#111827', fontSize: '0.875rem', fontWeight: '500' },
          nav: { display: 'flex', gap: '0.25rem' },
          nav_button: { 
            color: '#059669', 
            backgroundColor: 'transparent', 
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            width: '2rem',
            height: '2rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          },
          nav_button_previous: { marginLeft: 'auto' },
          nav_button_next: { marginRight: 'auto' },
          table: { width: '100%', borderCollapse: 'collapse' },
          head_row: { display: 'flex', gap: '0.25rem' },
          head_cell: { 
            color: '#9ca3af', 
            fontSize: '0.75rem', 
            fontWeight: '500',
            width: '2.5rem',
          },
          row: { display: 'flex', gap: '0.25rem', marginTop: '0.25rem' },
          cell: { 
            width: '2.5rem', 
            height: '2.5rem',
            padding: 0,
          },
          day: {
            width: '2.5rem',
            height: '2.5rem',
            color: '#374151',
            fontSize: '0.875rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none',
            boxShadow: 'none',
          },
          day_today: { 
            backgroundColor: 'transparent', 
            border: 'none',
            color: '#059669',
            fontWeight: '600',
            outline: 'none',
            boxShadow: 'none',
          },
          day_selected: { 
            backgroundColor: 'transparent',
            color: '#059669',
            fontWeight: '600',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
          },
          day_disabled: { 
            color: '#d1d5db', 
            cursor: 'not-allowed',
            outline: 'none',
            boxShadow: 'none',
          },
          day_hidden: { visibility: 'hidden' },
          day_range_middle: {
            backgroundColor: 'transparent',
            color: '#059669',
            fontWeight: '600',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
          },
        }}
        modifiersStyles={{
          today: {
            backgroundColor: 'transparent',
            border: 'none',
            color: '#059669',
            fontWeight: '600',
            outline: 'none',
            boxShadow: 'none',
          },
          selected: {
            backgroundColor: 'transparent',
            color: '#059669',
            fontWeight: '600',
            outline: 'none',
            boxShadow: 'none',
          },
        }}
      />
      <style jsx global>{`
        .rdp-day:focus {
          outline: none !important;
          box-shadow: none !important;
        }
        .rdp-day:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .rdp-button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .rdp-root {
          --rdp-accent-color: transparent !important;
          --rdp-accent-background-color: transparent !important;
        }
        .rdp-selected .rdp-day_button {
          background-color: transparent !important;
          color: #059669 !important;
          font-weight: 600 !important;
        }
        .rdp-selected {
          background-color: transparent !important;
        }
        .rdp-day_button[aria-selected="true"] {
          background-color: transparent !important;
          color: #059669 !important;
          font-weight: 600 !important;
        }
        .rdp-chevron {
          fill: #059669 !important;
        }
        .rdp-button_previous,
        .rdp-button_next {
          color: #059669 !important;
        }
      `}</style>
      <p className="text-sm text-gray-500 mt-3">
        {format(selected, 'EEEE, MMMM d, yyyy')}
      </p>
    </div>
  )
}
