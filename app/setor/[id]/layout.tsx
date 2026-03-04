'use client'

import { ReactNode } from 'react'

export default function SetorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
