'use client'

import { ReactNode } from 'react'
import { CommandPalette } from '@/components/command-palette'

export default function SetorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <CommandPalette />
      {children}
    </div>
  )
}
