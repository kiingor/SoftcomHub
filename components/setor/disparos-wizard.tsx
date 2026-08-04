'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Upload,
  Download,
  Sparkles,
  Send,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface Setor {
  id: string
  nome: string
  openai_ativo?: boolean | null
  openai_api_key?: string | null
}

interface Destinatario {
  cliente_id?: string
  nome: string | null
  cnpj: string | null
  registro: string | null
  telefone: string
}

interface Subsetor {
  id: string
  nome: string
  ativo: boolean
}

interface Colaborador {
  id: string
  nome: string
  is_online: boolean
}

type Step = 1 | 2 | 3

export function DisparosWizard({
  setor,
  onClose,
  onSuccess,
}: {
  setor: Setor
  onClose: () => void
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<Step>(1)
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [mensagem, setMensagem] = useState('')
  const [destinoTipo, setDestinoTipo] = useState<'subsetor' | 'atendentes' | null>(null)
  const [subsetorId, setSubsetorId] = useState<string>('')
  const [atendentesIds, setAtendentesIds] = useState<string[]>([])

  const [iaLoading, setIaLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [subsetores, setSubsetores] = useState<Subsetor[]>([])
  const [atendentes, setAtendentes] = useState<Colaborador[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: subs } = await supabase
        .from('subsetores')
        .select('id, nome, ativo')
        .eq('setor_id', setor.id)
        .eq('ativo', true)
        .order('nome')
      setSubsetores((subs as Subsetor[]) || [])

      const { data: cs } = await supabase
        .from('colaboradores_setores')
        .select('colaboradores(id, nome, is_online, ativo)')
        .eq('setor_id', setor.id)
      const cols = (cs || [])
        .map((r: { colaboradores: unknown }) => r.colaboradores as Colaborador & { ativo?: boolean } | null)
        .filter((c): c is Colaborador & { ativo?: boolean } => !!c && c.ativo !== false)
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      setAtendentes(cols)
    }
    load()
  }, [setor.id, supabase])

  const canNextFromStep1 = destinatarios.length > 0
  const canNextFromStep2 = mensagem.trim().length >= 5
  const canSubmit =
    destinoTipo === 'subsetor'
      ? Boolean(subsetorId)
      : destinoTipo === 'atendentes'
        ? atendentesIds.length > 0
        : false

  const handleMelhorarIA = async () => {
    if (!mensagem.trim()) return
    setIaLoading(true)
    try {
      const res = await fetch('/api/ia/melhorar-mensagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem, setor_id: setor.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao melhorar mensagem')
        return
      }
      setMensagem(data.mensagem_melhorada)
      toast.success('Mensagem melhorada')
    } catch {
      toast.error('Erro ao chamar IA')
    } finally {
      setIaLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const body = {
        tipo_origem: 'xls',
        destinatarios,
        mensagem,
        destino_tipo: destinoTipo,
        subsetor_id: destinoTipo === 'subsetor' ? subsetorId : null,
        atendentes_ids: destinoTipo === 'atendentes' ? atendentesIds : null,
      }
      const res = await fetch(`/api/setores/${setor.id}/disparos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao processar disparo')
        return
      }
      toast.success(
        `Disparo concluído: ${data.total_enviados} enviados, ${data.total_falhados} falhados`,
      )
      onSuccess()
    } catch {
      toast.error('Erro ao enviar disparo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Novo Disparo — Passo {step} de 3
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Importe os destinatários pela planilha.'}
            {step === 2 && 'Digite a mensagem que será enviada a todos os destinatários.'}
            {step === 3 && 'Escolha para qual destino criar os tickets.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {step === 1 && (
            <Step1Destinatarios
              setor={setor}
              destinatarios={destinatarios}
              setDestinatarios={setDestinatarios}
            />
          )}
          {step === 2 && (
            <Step2Mensagem
              setor={setor}
              mensagem={mensagem}
              setMensagem={setMensagem}
              iaLoading={iaLoading}
              onMelhorarIA={handleMelhorarIA}
              totalDestinatarios={destinatarios.length}
            />
          )}
          {step === 3 && (
            <Step3Destino
              subsetores={subsetores}
              atendentes={atendentes}
              destinoTipo={destinoTipo}
              setDestinoTipo={setDestinoTipo}
              subsetorId={subsetorId}
              setSubsetorId={setSubsetorId}
              atendentesIds={atendentesIds}
              setAtendentesIds={setAtendentesIds}
              totalDestinatarios={destinatarios.length}
            />
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          {step > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={submitting}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Voltar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {step < 3 && (
            <Button
              size="sm"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 1 && !canNextFromStep1) || (step === 2 && !canNextFromStep2)}
            >
              Próximo <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? (
                <>Enviando...</>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-2" />
                  Enviar Disparo ({destinatarios.length})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Step 1 ─────────────────────────────

function Step1Destinatarios({
  setor,
  destinatarios,
  setDestinatarios,
}: {
  setor: Setor
  destinatarios: Destinatario[]
  setDestinatarios: (d: Destinatario[]) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [xlsErrors, setXlsErrors] = useState<Array<{ row: number; message: string }>>([])

  const handleDownloadTemplate = () => {
    window.location.href = `/api/setores/${setor.id}/disparos/xls-preview`
  }

  const handleXlsSelected = async (file: File) => {
    setUploading(true)
    setXlsErrors([])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/setores/${setor.id}/disparos/xls-preview`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao processar planilha')
        return
      }
      setDestinatarios(data.destinatarios)
      setXlsErrors(data.errors || [])
      toast.success(`${data.total} destinatário(s) carregados`)
    } catch {
      toast.error('Erro ao enviar planilha')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeDestinatario = (index: number) => {
    setDestinatarios(destinatarios.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
        <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold">Importar Planilha (XLS)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Faça upload de uma planilha com colunas <strong>nome, cnpj, registro, telefone</strong>.
            Clientes novos são cadastrados automaticamente.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="h-3.5 w-3.5 mr-2" />
          Baixar modelo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleXlsSelected(f)
          }}
        />
        <Button
          variant="default"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-3.5 w-3.5 mr-2" />
          {uploading ? 'Processando...' : 'Selecionar planilha'}
        </Button>
      </div>

      {xlsErrors.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
            Avisos ({xlsErrors.length}):
          </p>
          <ul className="text-xs text-amber-800 dark:text-amber-200 list-disc pl-5 max-h-32 overflow-y-auto">
            {xlsErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.row > 0 ? `Linha ${e.row}: ` : ''}
                {e.message}
              </li>
            ))}
            {xlsErrors.length > 20 && <li>... e mais {xlsErrors.length - 20}</li>}
          </ul>
        </div>
      )}

      {destinatarios.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {destinatarios.length} destinatário(s) selecionado(s)
            </p>
            <Button variant="ghost" size="sm" onClick={() => setDestinatarios([])}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Limpar
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {destinatarios.map((d, i) => (
              <div
                key={`${d.telefone}-${i}`}
                className="flex items-center justify-between text-xs p-2 rounded bg-background"
              >
                <div className="flex-1 truncate">
                  <span className="font-medium">{d.nome || 'Sem nome'}</span>
                  <span className="text-muted-foreground ml-2">{d.telefone}</span>
                  {d.cnpj && <span className="text-muted-foreground ml-2">CNPJ: {d.cnpj}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeDestinatario(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Step 2 ─────────────────────────────

function Step2Mensagem({
  setor,
  mensagem,
  setMensagem,
  iaLoading,
  onMelhorarIA,
  totalDestinatarios,
}: {
  setor: Setor
  mensagem: string
  setMensagem: (m: string) => void
  iaLoading: boolean
  onMelhorarIA: () => void
  totalDestinatarios: number
}) {
  const iaDisponivel = Boolean(setor.openai_ativo && setor.openai_api_key)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="mensagem">Mensagem (será enviada a {totalDestinatarios} destinatários)</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={onMelhorarIA}
          disabled={!iaDisponivel || iaLoading || mensagem.trim().length < 5}
        >
          <Sparkles className={`h-3.5 w-3.5 mr-2 ${iaLoading ? 'animate-pulse' : ''}`} />
          {iaLoading ? 'Melhorando...' : 'Melhorar com IA'}
        </Button>
      </div>

      <Textarea
        id="mensagem"
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Digite a mensagem que será enviada..."
        rows={6}
        className="resize-none"
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {mensagem.length} caracteres
          {mensagem.trim().length < 5 && (
            <span className="text-amber-600 ml-2">mínimo 5 caracteres</span>
          )}
        </span>
        {!iaDisponivel && (
          <span className="text-muted-foreground">
            IA indisponível (configure OpenAI nas Configurações)
          </span>
        )}
      </div>

      {mensagem.trim().length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">Preview (como o cliente verá):</p>
          <div className="max-w-md rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/40 p-3 text-sm whitespace-pre-wrap">
            {mensagem}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Step 3 ─────────────────────────────

function Step3Destino({
  subsetores,
  atendentes,
  destinoTipo,
  setDestinoTipo,
  subsetorId,
  setSubsetorId,
  atendentesIds,
  setAtendentesIds,
  totalDestinatarios,
}: {
  subsetores: Subsetor[]
  atendentes: Colaborador[]
  destinoTipo: 'subsetor' | 'atendentes' | null
  setDestinoTipo: (t: 'subsetor' | 'atendentes') => void
  subsetorId: string
  setSubsetorId: (id: string) => void
  atendentesIds: string[]
  setAtendentesIds: (ids: string[]) => void
  totalDestinatarios: number
}) {
  const toggleAtendente = (id: string) => {
    if (atendentesIds.includes(id)) {
      setAtendentesIds(atendentesIds.filter((x) => x !== id))
    } else {
      setAtendentesIds([...atendentesIds, id])
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDestinoTipo('subsetor')}
          className={`p-3 rounded-lg border-2 text-left transition ${
            destinoTipo === 'subsetor'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground'
          }`}
        >
          <p className="font-medium">Subsetor</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tickets distribuídos automaticamente entre os atendentes do subsetor (respeita carga e
            disponibilidade).
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDestinoTipo('atendentes')}
          className={`p-3 rounded-lg border-2 text-left transition ${
            destinoTipo === 'atendentes'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground'
          }`}
        >
          <p className="font-medium">Atendentes específicos</p>
          <p className="text-xs text-muted-foreground mt-1">
            Distribui igualitariamente entre os atendentes selecionados (round-robin estrito, ignora
            disponibilidade).
          </p>
        </button>
      </div>

      {destinoTipo === 'subsetor' && (
        <div className="space-y-2">
          <Label>Subsetor</Label>
          {subsetores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este setor não possui subsetores ativos. Crie subsetores em Configurações ou escolha
              &quot;Atendentes específicos&quot;.
            </p>
          ) : (
            <Select value={subsetorId} onValueChange={setSubsetorId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um subsetor" />
              </SelectTrigger>
              <SelectContent>
                {subsetores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {destinoTipo === 'atendentes' && (
        <div className="space-y-2">
          <Label>Atendentes ({atendentesIds.length} selecionados)</Label>
          {atendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum atendente ativo encontrado neste setor.
            </p>
          ) : (
            <div className="rounded-lg border max-h-[300px] overflow-y-auto">
              {atendentes.map((a) => {
                const checked = atendentesIds.includes(a.id)
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 p-2 border-b last:border-0 cursor-pointer hover:bg-accent/30"
                    onClick={() => toggleAtendente(a.id)}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAtendente(a.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm">{a.nome}</span>
                      {a.is_online ? (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Online
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" /> Offline
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Os tickets são distribuídos no padrão round-robin: 1→A, 2→B, 3→C, 4→A... mesmo que o
            atendente esteja offline.
          </p>
        </div>
      )}

      {destinoTipo && (
        <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
          <p className="text-sm font-medium">Resumo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Enviando <strong>{totalDestinatarios}</strong> disparo(s) para{' '}
            {destinoTipo === 'subsetor'
              ? `subsetor selecionado`
              : `${atendentesIds.length} atendente(s)`}
            .
          </p>
        </div>
      )}
    </div>
  )
}
