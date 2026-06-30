import type { MetadataRoute } from 'next'

/**
 * Manifest do PWA. Quando o site é instalado como app (Chrome → Instalar),
 * as notificações passam a vir do app e mostram ESTE ícone — não o do Chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SoftcomHub — Atendimento',
    short_name: 'SoftcomHub',
    description: 'Plataforma de atendimento multicanal (WhatsApp, Evolution, Discord)',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#EE6D1D',
    icons: [
      { src: '/workdesk-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/workdesk-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/workdesk-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
