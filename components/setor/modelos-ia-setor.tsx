'use client'

import { useId, useState } from 'react'
import { AlertTriangle, Loader2, ListFilter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_CUSTOM_AI_CHAT_MODEL,
  DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL,
  DEFAULT_OPENAI_CHAT_MODEL,
  DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
} from '@/lib/ai-provider'

interface ModelosIaSetorProps {
  setorId: string
  /** O setor aponta para um gateway próprio? Muda o modelo padrão de cada campo. */
  urlPersonalizada: boolean
  modeloChat: string
  modeloTranscricao: string
  onChange: (campo: 'openai_modelo_chat' | 'openai_modelo_transcricao', valor: string) => void
  /** As colunas ainda não existem neste banco — avisa em vez de fingir que salvou. */
  indisponivel?: boolean
}

/**
 * Escolha do modelo de IA do setor.
 *
 * Campo de texto livre com sugestões, e não um <select> fechado: o catálogo é
 * do provedor, muda sem aviso (o gateway da Softcom listava 1168 modelos em
 * 18/08/2026) e nem todo endpoint compatível expõe /models. A lista é buscada
 * sob demanda pelo servidor — a chave da API do setor não pode passar pelo
 * navegador — e, quando a busca falha, o campo continua utilizável na mão.
 */
export function ModelosIaSetor({
  setorId,
  urlPersonalizada,
  modeloChat,
  modeloTranscricao,
  onChange,
  indisponivel,
}: ModelosIaSetorProps) {
  const [modelos, setModelos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const listaId = useId()

  const padraoChat = urlPersonalizada ? DEFAULT_CUSTOM_AI_CHAT_MODEL : DEFAULT_OPENAI_CHAT_MODEL
  const padraoTranscricao = urlPersonalizada
    ? DEFAULT_CUSTOM_AI_TRANSCRIPTION_MODEL
    : DEFAULT_OPENAI_TRANSCRIPTION_MODEL

  const buscarModelos = async () => {
    setCarregando(true)
    setAviso(null)
    try {
      const res = await fetch(`/api/setores/${setorId}/ia/modelos`)
      const data = await res.json()
      if (!res.ok) {
        setAviso(data?.error || 'Não foi possível listar os modelos.')
        return
      }
      setModelos(data.modelos || [])
      if (data.erro) setAviso(data.erro)
      else if (!data.modelos?.length) setAviso('O provedor não retornou nenhum modelo.')
    } catch {
      setAviso('Não foi possível listar os modelos.')
    } finally {
      setCarregando(false)
    }
  }

  const campos = [
    {
      id: 'openai_modelo_chat' as const,
      rotulo: 'Modelo de chat',
      valor: modeloChat,
      padrao: padraoChat,
      ajuda: 'Usado ao melhorar a mensagem do atendente.',
    },
    {
      id: 'openai_modelo_transcricao' as const,
      rotulo: 'Modelo de transcrição',
      valor: modeloTranscricao,
      padrao: padraoTranscricao,
      ajuda: 'Usado ao transcrever os áudios recebidos.',
    },
  ]

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Modelos</p>
          <p className="text-xs text-muted-foreground">
            Deixe em branco para usar o padrão do provedor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={buscarModelos}
          disabled={carregando}
        >
          {carregando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListFilter className="h-3.5 w-3.5" />
          )}
          {modelos.length > 0 ? `${modelos.length} modelos` : 'Buscar modelos'}
        </Button>
      </div>

      <datalist id={listaId}>
        {modelos.map((modelo) => (
          <option key={modelo} value={modelo} />
        ))}
      </datalist>

      <div className="grid gap-3 md:grid-cols-2">
        {campos.map((campo) => (
          <div key={campo.id} className="space-y-2">
            <Label htmlFor={campo.id}>{campo.rotulo}</Label>
            <Input
              id={campo.id}
              className="h-8 font-mono"
              list={listaId}
              placeholder={campo.padrao}
              value={campo.valor}
              onChange={(e) => onChange(campo.id, e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {campo.ajuda} Padrão: <span className="font-mono">{campo.padrao}</span>
            </p>
          </div>
        ))}
      </div>

      {aviso && (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 mt-px" />
          {aviso} Você ainda pode digitar o nome do modelo.
        </p>
      )}

      {indisponivel && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          A escolha de modelo continuará no padrão até a migration deste ambiente ser executada.
        </p>
      )}
    </div>
  )
}
