'use client'

import React from "react"

import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { DashboardSidebar } from './dashboard-sidebar'
import { DashboardHeader } from './dashboard-header'
import { CommandPalette } from '@/components/command-palette'
import { PushPermissionPrompt } from '@/components/push-permission-prompt'

interface DashboardShellProps {
  children: React.ReactNode
  user: User
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <CommandPalette />
      <PushPermissionPrompt />
      {/* Canvas base — papel quente off-white (console editorial), fora do fluxo */}
      <div className="fixed inset-0 -z-10 bg-background" />

      {/* Sidebar — fixed via inline style, garantido fora do fluxo */}
      <DashboardSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />

      {/* Conteúdo principal — bloco simples, padding-left compensa a sidebar */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <DashboardHeader
          user={user}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </>
  )
}
