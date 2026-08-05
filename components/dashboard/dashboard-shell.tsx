'use client'

import React from "react"

import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { DashboardSidebar } from './dashboard-sidebar'
import { DashboardHeader } from './dashboard-header'
import { CommandPalette } from '@/components/command-palette'

interface DashboardShellProps {
  children: React.ReactNode
  user: User
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dashboard-sidebar-collapsed'

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Minimizar no desktop: some a sidebar inteira e o conteúdo usa a largura
  // toda. Preferência persistida — o gestor não quer reabrir isso a cada
  // navegação.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1')
    } catch { /* preferência corrompida cai no padrão (expandida) */ }
  }, [])
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <>
      <CommandPalette />
      {/* Canvas base — papel quente off-white (console editorial), fora do fluxo */}
      <div className="fixed inset-0 -z-10 bg-background" />

      {/* Sidebar — fixed via inline style, garantido fora do fluxo */}
      <DashboardSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} collapsed={sidebarCollapsed} />

      {/* Conteúdo principal — bloco simples, padding-left compensa a sidebar (só quando ela está visível) */}
      <div className={sidebarCollapsed ? 'flex min-h-screen flex-col' : 'flex min-h-screen flex-col lg:pl-64'}>
        <DashboardHeader
          user={user}
          onMenuClick={() => setSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarCollapsed={toggleSidebarCollapsed}
        />
        <main className="flex-1 px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </>
  )
}
