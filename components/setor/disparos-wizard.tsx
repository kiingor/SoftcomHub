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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Upload,
  Users,
  Download,
  Sparkles,
  Send,
  Trash2,
  X,
  Search,
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

interface ClienteRow {
  id: string
  nome: string | null
  telefone: string | null
  CNPJ: string | null
  Registro: string | null
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

const CLIENTES_PAGE_SIZE = 25

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
  const [tipoOrigem, setTipoOrigem] = useState<'xls' | 'clientes_hub' | null>(null)
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
        tipo_origem: tipoOrigem,
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
            <Send className="h-5 w-5" />
            Novo Disparo — Passo {step} de 3
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Escolha como importar os destinatários.'}
            {step === 2 && 'Digite a mensagem que será enviada a todos os destinatários.'}
            {step === 3 && 'Escolha para qual destino criar os tickets.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {step === 1 && (
            <Step1Destinatarios
              setor={setor}
              tipoOrigem={tipoOrigem}
              setTipoOrigem={setTipoOrigem}
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

        <DialogFooter className="border-t pt-4">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} disabled={submitting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 1 && !canNextFromStep1) || (step === 2 && !canNextFromStep2)}
            >
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? (
                <>Enviando...</>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
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
  tipoOrigem,
  setTipoOrigem,
  destinatarios,
  setDestinatarios,
}: {
  setor: Setor
  tipoOrigem: 'xls' | 'clientes_hub' | null
  setTipoOrigem: (t: 'xls' | 'clientes_hub' | null) => void
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

  if (!tipoOrigem) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setTipoOrigem('xls')}
          className="p-6 rounded-xl border-2 border-dashed hover:border-primary hover:bg-accent/50 transition text-left flex flex-col items-start gap-3"
        >
          <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
          <div>
            <p className="font-semibold">Importar Planilha (XLS)</p>
            <p className="text-sm text-muted-foreground mt-1">
              Faça upload de uma planilha com colunas <strong>nome, cnpj, registro, telefone</strong>.
              Clientes novos são cadastrados automaticamente.
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setTipoOrigem('clientes_hub')}
          className="p-6 rounded-xl border-2 border-dashed hover:border-primary hover:bg-accent/50 transition text-left flex flex-col items-start gap-3"
        >
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <p className="font-semibold">Selecionar Clientes do Hub</p>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha clientes já cadastrados. Use filtros por CNPJ, Registro ou Telefone.
            </p>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-sm">
          {tipoOrigem === 'xls' ? 'Planilha (XLS)' : 'Clientes do Hub'}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setTipoOrigem(null)
            setDestinatarios([])
            setXlsErrors([])
          }}
        >
          Trocar origem
        </Button>
      </div>

      {tipoOrigem === 'xls' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
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
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
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
        </div>
      )}

      {tipoOrigem === 'clientes_hub' && (
        <ClientesHubPicker
          setor={setor}
          destinatarios={destinatarios}
          setDestinatarios={setDestinatarios}
        />
      )}

      {destinatarios.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {destinatarios.length} destinatário(s) selecionado(s)
            </p>
            <Button variant="ghost" size="sm" onClick={() => setDestinatarios([])}>
              <Trash2 className="h-4 w-4 mr-1" />
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

function ClientesHubPicker({
  setor,
  destinatarios,
  setDestinatarios,
}: {
  setor: Setor
  destinatarios: Destinatario[]
  setDestinatarios: (d: Destinatario[]) => void
}) {
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const h = setTimeout(() => setQDebounced(q), 400)
    return () => clearTimeout(h)
  }, [q])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(CLIENTES_PAGE_SIZE),
      })
      if (qDebounced) params.set('q', qDebounced)
      const res = await fetch(`/api/setores/${setor.id}/clientes?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setClientes(data.clientes)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [setor.id, page, qDebounced])

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  const totalPages = Math.max(1, Math.ceil(total / CLIENTES_PAGE_SIZE))

  const toggleCliente = (c: ClienteRow) => {
    const next = new Set(selectedIds)
    if (next.has(c.id)) {
      next.delete(c.id)
    } else if (c.telefone) {
      next.add(c.id)
    }
    setSelectedIds(next)
  }

  const addSelected = () => {
    const jaIncluidos = new Set(destinatarios.map((d) => d.cliente_id).filter(Boolean))
    const novos: Destinatario[] = []
    for (const c of clientes) {
      if (!selectedIds.has(c.id) || jaIncluidos.has(c.id) || !c.telefone) continue
      novos.push({
        cliente_id: c.id,
        nome: c.nome,
        cnpj: c.CNPJ,
        registro: c.Registro,
        telefone: c.telefone,
      })
    }
    setDestinatarios([...destinatarios, ...novos])
    setSelectedIds(new Set())
    toast.success(`${novos.length} cliente(s) adicionados`)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por CNPJ, Registro, telefone ou nome..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <Button onClick={addSelected} disabled={selectedIds.size === 0}>
          Adicionar ({selectedIds.size})
        </Button>
      </div>

      <div className="rounded-lg border max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-40" />
            <col className="w-28" />
            <col className="w-36" />
          </colgroup>
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="p-2"></th>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">CNPJ</th>
              <th className="p-2 text-left">Registro</th>
              <th className="p-2 text-left">Telefone</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : (
              clientes.map((c) => (
                <tr
                  key={c.id}
                  className="border-t hover:bg-accent/30 cursor-pointer"
                  onClick={() => toggleCliente(c)}
                >
                  <td className="p-2">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      disabled={!c.telefone}
                      onCheckedChange={() => toggleCliente(c)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-2 truncate" title={c.nome || ''}>{c.nome || '—'}</td>
                  <td className="p-2 font-mono text-xs truncate" title={c.CNPJ || ''}>{c.CNPJ || '—'}</td>
                  <td className="p-2 font-mono text-xs truncate" title={c.Registro || ''}>{c.Registro || '—'}</td>
                  <td className="p-2 font-mono text-xs truncate" title={c.telefone || ''}>
                    {c.telefone || <span className="text-red-500">sem</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages} — {total} cliente(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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
          <Sparkles className={`h-4 w-4 mr-2 ${iaLoading ? 'animate-pulse' : ''}`} />
          {iaLoading ? 'Melhorando...' : 'Melhorar com IA'}
        </Button>
      </div>

      <Textarea
        id="mensagem"
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Digite a mensagem que será enviada..."
        rows={8}
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
        <div className="mt-4">
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setDestinoTipo('subsetor')}
          className={`p-4 rounded-lg border-2 text-left transition ${
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
          className={`p-4 rounded-lg border-2 text-left transition ${
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
                    className="flex items-center gap-3 p-2 border-b last:border-0 cursor-pointer hover:bg-accent/30"
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
        <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
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
