'use client'

import React from "react"

import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { DashboardSidebar } from './dashboard-sidebar'
import { DashboardHeader } from './dashboard-header'

interface DashboardShellProps {
  children: React.ReactNode
  user: User
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-svh w-full max-w-full overflow-x-hidden bg-[#F0F1F5] dark:bg-[#0A0A12]">
      {/* ─── Liquid Glass ambient background ─── */}
      {/* Primary blob — warm accent */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 h-[600px] w-[600px] rounded-full opacity-25 dark:opacity-[0.07] blur-[100px]"
        style={{ background: 'radial-gradient(circle, #c084fc 0%, #818cf8 40%, transparent 70%)' }}
      />
      {/* Secondary blob — cool accent */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-[40%] -right-48 h-[700px] w-[700px] rounded-full opacity-20 dark:opacity-[0.06] blur-[120px]"
        style={{ background: 'radial-gradient(circle, #60a5fa 0%, #38bdf8 40%, transparent 70%)' }}
      />
      {/* Tertiary blob — warm pink */}
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 left-[25%] h-[500px] w-[500px] rounded-full opacity-15 dark:opacity-[0.05] blur-[100px]"
        style={{ background: 'radial-gradient(circle, #f9a8d4 0%, #fb923c 50%, transparent 70%)' }}
      />
      {/* Subtle center glow for depth */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-[20%] left-[50%] -translate-x-1/2 h-[800px] w-[800px] rounded-full opacity-[0.08] dark:opacity-[0.03] blur-[150px]"
        style={{ background: 'radial-gradient(circle, #e9d5ff 0%, transparent 60%)' }}
      />

      <DashboardSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex flex-1 flex-col min-w-0 lg:pl-64">
        <DashboardHeader
          user={user}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 w-full px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  )
}
