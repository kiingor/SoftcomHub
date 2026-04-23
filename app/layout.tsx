import React from "react"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/error-boundary'
import { GlobalErrorHandler } from '@/components/global-error-handler'
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
    // translate="no" + meta notranslate previnem o Chrome Translate de envolver
    // text nodes em <font> tags, o que quebrava o reconcile do React com
    // "NotFoundError: Failed to execute 'insertBefore'". App é pt-BR only.
    <html lang="pt-BR" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className={`font-sans antialiased notranslate`} suppressHydrationWarning>
        <ErrorBoundary tela="Global">
          {children}
        </ErrorBoundary>
        <GlobalErrorHandler />
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
