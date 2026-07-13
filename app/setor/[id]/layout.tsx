'use client'

import { ReactNode } from 'react'
import { CommandPalette } from '@/components/command-palette'
import { PushPermissionPrompt } from '@/components/push-permission-prompt'

export default function SetorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <CommandPalette />
      <PushPermissionPrompt />
      {children}
    </div>
  )
}
