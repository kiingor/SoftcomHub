'use client'

import { useState } from 'react'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AuthForm({
  setorNome,
  onAuth,
  loading,
  error,
  onBack,
}: {
  setorNome: string
  onAuth: (nome: string, telefone: string, cnpj?: string) => void
  loading: boolean
  error?: string | null
  onBack: () => void
}) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cnpj, setCnpj] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim() || !telefone.trim()) {
      return
    }

    onAuth(nome, telefone, cnpj || undefined)
  }

  const isValid = nome.trim() && telefone.trim()

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          disabled={loading}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-muted-foreground">Departamento</p>
          <p className="font-medium text-sm">{setorNome}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
        <div>
          <label className="text-sm font-medium block mb-2">
            Seu nome
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={loading}
            placeholder="Ex: João Silva"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            Telefone/WhatsApp
          </label>
          <input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            disabled={loading}
            placeholder="Ex: (11) 99999-9999"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            CNPJ (opcional)
          </label>
          <input
            type="text"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            disabled={loading}
            placeholder="Ex: 12.345.678/0001-90"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-gray-100"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

        <div className="flex-1" />

        <Button
          type="submit"
          disabled={!isValid || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Conectando...
            </>
          ) : (
            'Continuar'
          )}
        </Button>
      </form>
    </div>
  )
}
