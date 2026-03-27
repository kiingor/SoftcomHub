import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SoftcomHub API - Documentação',
  description: 'Documentação da API do painel de atendimentos SoftcomHub',
}

export default function DocLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100">
      {children}
    </div>
  )
}
