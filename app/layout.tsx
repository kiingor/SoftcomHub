import React from "react"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const _inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Atendimento Inteligente',
  description: 'Plataforma de atendimento multicanal com WhatsApp e Discord',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
