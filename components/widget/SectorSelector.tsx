'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Setor {
  id: string
  nome: string
  descricao?: string
  tipo?: string
  destino_nome?: string | null
}

export function SectorSelector({
  widgetKey,
  onSelect,
}: {
  widgetKey: string
  onSelect: (setorId: string, setorNome: string) => void
}) {
  const [setores, setSetores] = useState<Setor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSetores = async () => {
      try {
        const res = await fetch(
          `/api/widget/setores?widget_key=${encodeURIComponent(widgetKey)}`,
        )

        if (!res.ok) {
          throw new Error('Erro ao carregar setores')
        }

        const data = await res.json()
        setSetores(data.setores || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }

    fetchSetores()
  }, [widgetKey])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">Carregando setores...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-6 gap-4">
      <div>
        <h2 className="text-xl font-semibold mb-2">
          Como podemos ajudar?
        </h2>
        <p className="text-sm text-muted-foreground">
          Escolha um departamento para conversar
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 max-h-[calc(100vh-200px)] overflow-y-auto">
        {setores.map((setor, idx) => (
          <button
            key={setor.tipo || `${setor.id}-${idx}`}
            onClick={() => onSelect(setor.id, setor.nome)}
            className="p-4 text-left border rounded-lg hover:bg-primary/5 hover:border-primary transition-colors"
          >
            <p className="font-medium text-sm">{setor.nome}</p>
            {setor.descricao && (
              <p className="text-xs text-muted-foreground mt-1">
                {setor.descricao}
              </p>
            )}
          </button>
        ))}
      </div>

      {setores.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhum setor disponível
        </p>
      )}
    </div>
  )
}
