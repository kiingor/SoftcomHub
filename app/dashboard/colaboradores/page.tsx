'use client'

import { useEffect, useState, useMemo, useDeferredValue } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Users, Plus, Pencil, UserX, Loader2, Circle, Building2, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useColaborador } from '@/lib/hooks/use-data'

interface Setor {
  id: string
  nome: string
}

interface Permissao {
  id: string
  nome: string
  can_view_dashboard?: boolean
}

interface Colaborador {
  id: string
  nome: string
  email: string
  setor_id: string | null
  permissao_id: string | null
  is_master: boolean
  is_online: boolean
  ativo: boolean
  created_at: string
  setor?: Setor | null
  permissao?: Permissao | null
  setores_ativos_sessao?: string[]
}

const MAX_VISIBLE_SETORES = 3
const ELEVATED_PERMISSION_NAMES = new Set(['admin', 'supervisor'])

function isElevatedPermission(permissao?: Permissao | null) {
  const permissionName = permissao?.nome?.toLowerCase()
  return permissao?.can_view_dashboard === true || ELEVATED_PERMISSION_NAMES.has(permissionName || '')
}

// Lê o access_token do usuário direto do cookie do @supabase/ssr (síncrono).
// Necessário porque o client supabase-js no browser SERIALIZA queries
// concorrentes pelo seu auth lock interno — um Promise.all de 5 selects roda em
// cascata (~600ms). Lendo o token aqui, disparamos as 5 leituras via REST cru
// em paralelo de verdade (~110ms), sem passar pelo lock.
// Formato do cookie: sb-<ref>-auth-token = "base64-<base64(JSON da sessão)>",
// possivelmente fatiado em .0/.1/... quando a sessão é grande.
function getSupabaseAccessToken(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const chunks: { name: string; value: string }[] = []
    for (const c of document.cookie.split(';')) {
      const eq = c.indexOf('=')
      if (eq === -1) continue
      const name = c.slice(0, eq).trim()
      if (/-auth-token(\.\d+)?$/.test(name)) {
        chunks.push({ name, value: decodeURIComponent(c.slice(eq + 1)) })
      }
    }
    if (chunks.length === 0) return null
    chunks.sort((a, b) => {
      const ia = parseInt(a.name.split('.').pop() || '0', 10)
      const ib = parseInt(b.name.split('.').pop() || '0', 10)
      return (isNaN(ia) ? 0 : ia) - (isNaN(ib) ? 0 : ib)
    })
    let raw = chunks.map((c) => c.value).join('')
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7))
    const session = JSON.parse(raw)
    return session?.access_token || session?.currentSession?.access_token || null
  } catch {
    return null
  }
}

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [colaboradorToDeactivate, setColaboradorToDeactivate] = useState<Colaborador | null>(null)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    setor_id: '',
    permissao_id: '',
    suporte_id: '',
    setores_selecionados: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [setorSearchTerm, setSetorSearchTerm] = useState('')

  // Modal de "Configurar setores ativos" — admin escolhe de quais setores
  // o atendente recebe tickets (subset dos vinculados).
  const [setoresAtivosModalOpen, setSetoresAtivosModalOpen] = useState(false)
  const [colaboradorSetoresAtivos, setColaboradorSetoresAtivos] = useState<Colaborador | null>(null)
  const [setoresAtivosSelecionados, setSetoresAtivosSelecionados] = useState<Set<string>>(new Set())
  const [savingSetoresAtivos, setSavingSetoresAtivos] = useState(false)

  const supabase = createClient()
  const { toast } = useToast()
  const { data: colaboradorLogado } = useColaborador()
  const canDeactivateColaborador = colaboradorLogado?.is_master === true
  const canManagePermissionLevel = colaboradorLogado?.is_master === true

  const [colaboradorSetores, setColaboradorSetores] = useState<{ colaborador_id: string; setor_id: string }[]>([])
  const [mediasNPS, setMediasNPS] = useState<Map<string, { media: number; total: number }>>(new Map())
  const atendentePermissao = useMemo(
    () => permissoes.find((permissao) => permissao.nome.toLowerCase() === 'atendente')
      || permissoes.find((permissao) => !isElevatedPermission(permissao)),
    [permissoes],
  )
  const currentFormPermissao = permissoes.find((permissao) => permissao.id === formData.permissao_id)
  const permissoesDisponiveis = canManagePermissionLevel
    ? permissoes
    : Array.from(
      new Map(
        [currentFormPermissao, atendentePermissao, ...permissoes.filter((permissao) => !isElevatedPermission(permissao))]
          .filter(Boolean)
          .map((permissao) => [permissao!.id, permissao!]),
      ).values(),
    )
  const setoresFiltrados = useMemo(() => {
    const query = setorSearchTerm.trim().toLowerCase()
    if (!query) return setores
    return setores.filter((setor) => setor.nome.toLowerCase().includes(query))
  }, [setores, setorSearchTerm])
  const setoresSelecionados = useMemo(() => {
    const selectedIds = new Set(formData.setores_selecionados)
    return setores.filter((setor) => selectedIds.has(setor.id))
  }, [setores, formData.setores_selecionados])

  function getSetoresDoColaborador(colaboradorId: string): string[] {
    return colaboradorSetores
      .filter((cs) => cs.colaborador_id === colaboradorId)
      .map((cs) => cs.setor_id)
  }

  // Filtro da busca memoizado + deferido: digitar não trava a UI e a lista só
  // recalcula quando colaboradores/termo mudam (não a cada render do polling).
  const deferredSearch = useDeferredValue(searchTerm)
  const colaboradoresFiltrados = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()
    if (!q) return colaboradores
    return colaboradores.filter(
      (c) => c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    )
  }, [colaboradores, deferredSearch])

  async function fetchData() {
    setLoading(true)
    try {
      // As 5 buscas são independentes. O caminho RÁPIDO dispara tudo em paralelo
      // via REST cru (o supabase-js no browser serializaria pelo auth lock).
      // Se o token não estiver acessível, cai no FALLBACK via supabase-js
      // (correto, porém serializado) — nunca deixa a tela vazia por isso.
      const token = getSupabaseAccessToken()

      let colaboradoresData: any[] = []
      let setoresData: Setor[] = []
      let permissoesData: Permissao[] = []
      let colabSetoresData: { colaborador_id: string; setor_id: string }[] = []
      let avaliacoesData: { colaborador_id: string; nota: number }[] = []

      if (token) {
        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const rest = (path: string) =>
          fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
          }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`${r.status} em ${path.split('?')[0]}`)),
          )
        // Atendentes: TODOS com vínculo em colaboradores_setores (inclui
        // supervisores que também atendem). Supervisor puro (sem vínculo) só
        // aparece em /dashboard/usuarios.
        const r = await Promise.all([
          rest(
            'colaboradores?select=*,setor:setores(id,nome),permissao:permissoes(id,nome),colaboradores_setores!inner(setor_id)&order=created_at.desc',
          ),
          rest('setores?select=id,nome&order=nome'),
          rest('permissoes?select=id,nome,can_view_dashboard&order=nome'),
          rest('colaboradores_setores?select=colaborador_id,setor_id'),
          rest('avaliacoes?select=colaborador_id,nota'),
        ])
        colaboradoresData = r[0] || []
        setoresData = r[1] || []
        permissoesData = r[2] || []
        colabSetoresData = r[3] || []
        avaliacoesData = r[4] || []
      } else {
        const [colaboradoresRes, setoresRes, permissoesRes, colabSetoresRes, avaliacoesRes] =
          await Promise.all([
            supabase
              .from('colaboradores')
              .select('*, setor:setores(id, nome), permissao:permissoes(id, nome), colaboradores_setores!inner(setor_id)')
              .order('created_at', { ascending: false }),
            supabase.from('setores').select('id, nome').order('nome'),
            supabase.from('permissoes').select('id, nome, can_view_dashboard').order('nome'),
            supabase.from('colaboradores_setores').select('colaborador_id, setor_id'),
            supabase.from('avaliacoes').select('colaborador_id, nota'),
          ])
        colaboradoresData = colaboradoresRes.data || []
        setoresData = (setoresRes.data as Setor[]) || []
        permissoesData = (permissoesRes.data as Permissao[]) || []
        colabSetoresData = colabSetoresRes.data || []
        avaliacoesData = (avaliacoesRes.data as { colaborador_id: string; nota: number }[]) || []
      }

      // Deduplica (inner join retorna 1 linha por vínculo)
      const uniqueMap = new Map<string, any>()
      for (const c of colaboradoresData) {
        if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c)
      }
      setColaboradores(Array.from(uniqueMap.values()))
      setSetores(setoresData)
      setPermissoes(permissoesData)
      setColaboradorSetores(colabSetoresData)

      // NPS por colaborador (média das notas em avaliacoes)
      const npsMap = new Map<string, { media: number; total: number }>()
      const grouped = new Map<string, number[]>()
      for (const a of avaliacoesData) {
        if (!grouped.has(a.colaborador_id)) grouped.set(a.colaborador_id, [])
        grouped.get(a.colaborador_id)!.push(a.nota)
      }
      for (const [id, notas] of grouped) {
        npsMap.set(id, { media: notas.reduce((s, n) => s + n, 0) / notas.length, total: notas.length })
      }
      setMediasNPS(npsMap)
    } catch (err) {
      console.error('[Atendentes] Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Admin page: polling every 30s instead of a global unfiltered realtime channel
    // on `colaboradores` (which was broadcasting every status update to every admin).
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  function openCreateModal() {
    setEditingColaborador(null)
    setFormData({
      nome: '',
      email: '',
      senha: '',
      setor_id: '',
      permissao_id: '',
      suporte_id: '',
      setores_selecionados: [],
    })
    setSetorSearchTerm('')
    setError(null)
    setModalOpen(true)
  }

  function openEditModal(colaborador: Colaborador) {
    setEditingColaborador(colaborador)
    setFormData({
      nome: colaborador.nome,
      email: colaborador.email,
      senha: '',
      setor_id: colaborador.setor_id || '',
      permissao_id: colaborador.permissao_id || '',
      suporte_id: (colaborador as any).suporte_id || '',
      setores_selecionados: getSetoresDoColaborador(colaborador.id),
    })
    setSetorSearchTerm('')
    setError(null)
    setModalOpen(true)
  }

  function toggleSetorSelection(setorId: string) {
    setFormData((prev) => ({
      ...prev,
      setores_selecionados: prev.setores_selecionados.includes(setorId)
        ? prev.setores_selecionados.filter((id) => id !== setorId)
        : [...prev.setores_selecionados, setorId],
    }))
  }

  function selectFilteredSetores() {
    setFormData((prev) => ({
      ...prev,
      setores_selecionados: Array.from(new Set([
        ...prev.setores_selecionados,
        ...setoresFiltrados.map((setor) => setor.id),
      ])),
    }))
  }

  function clearSelectedSetores() {
    setFormData((prev) => ({
      ...prev,
      setores_selecionados: [],
    }))
  }

  function openDeactivateDialog(colaborador: Colaborador) {
    if (!canDeactivateColaborador) return
    setColaboradorToDeactivate(colaborador)
    setDeactivateDialogOpen(true)
  }

  // Abre o modal de configuração de setores ativos pra um atendente
  function openSetoresAtivosModal(colaborador: Colaborador) {
    setColaboradorSetoresAtivos(colaborador)
    setSetoresAtivosSelecionados(
      new Set(Array.isArray(colaborador.setores_ativos_sessao) ? colaborador.setores_ativos_sessao : []),
    )
    setSetoresAtivosModalOpen(true)
  }

  function toggleSetorAtivoCheckbox(setorId: string) {
    setSetoresAtivosSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(setorId)) next.delete(setorId)
      else next.add(setorId)
      return next
    })
  }

  async function handleSaveSetoresAtivos() {
    if (!colaboradorSetoresAtivos) return
    setSavingSetoresAtivos(true)
    try {
      const novosSetores = Array.from(setoresAtivosSelecionados)
      const { error } = await supabase
        .from('colaboradores')
        .update({ setores_ativos_sessao: novosSetores })
        .eq('id', colaboradorSetoresAtivos.id)
      if (error) throw error
      toast({
        title: 'Configuração salva',
        description: `${colaboradorSetoresAtivos.nome} agora recebe tickets de ${novosSetores.length} setor(es).`,
      })
      setSetoresAtivosModalOpen(false)
      setColaboradorSetoresAtivos(null)
      await fetchData()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Tente novamente',
        variant: 'destructive',
      })
    } finally {
      setSavingSetoresAtivos(false)
    }
  }

  async function handleSave() {
    if (!formData.nome.trim()) {
      setError('Nome e obrigatorio')
      return
    }

    setSaving(true)
    setError(null)

    const effectivePermissaoId = canManagePermissionLevel
      ? formData.permissao_id || null
      : editingColaborador
        ? editingColaborador.permissao_id || atendentePermissao?.id || null
        : atendentePermissao?.id || null

    if (!canManagePermissionLevel && !effectivePermissaoId) {
      setError('Permissao de atendente nao encontrada. Chame um administrador.')
      setSaving(false)
      return
    }

    const selectedPermissao = permissoes.find((permissao) => permissao.id === effectivePermissaoId)
    const isAdminPermission = selectedPermissao?.nome?.toLowerCase() === 'admin'
    const permissionName = selectedPermissao?.nome?.toLowerCase()
    const hasDashboardAccess = selectedPermissao?.can_view_dashboard === true || permissionName === 'supervisor' || isAdminPermission

    if (editingColaborador) {
      // Update existing colaborador
      const { error: updateError } = await supabase
        .from('colaboradores')
        .update({
          nome: formData.nome.trim(),
          setor_id: formData.setor_id || null,
          permissao_id: effectivePermissaoId,
          is_master: isAdminPermission,
          suporte_id: formData.suporte_id.trim() || null,
        })
        .eq('id', editingColaborador.id)

      if (updateError) {
        setError('Erro ao atualizar colaborador: ' + updateError.message)
        setSaving(false)
        return
      }

      // Update colaborador_setores join table
      const { error: deleteAtendimentoError } = await supabase
        .from('colaboradores_setores')
        .delete()
        .eq('colaborador_id', editingColaborador.id)
      if (deleteAtendimentoError) {
        setError('Erro ao atualizar setores de atendimento: ' + deleteAtendimentoError.message)
        setSaving(false)
        return
      }

      if (formData.setores_selecionados.length > 0) {
        const relations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: editingColaborador.id,
          setor_id: setorId,
        }))
        const { error: insertAtendimentoError } = await supabase.from('colaboradores_setores').insert(relations)
        if (insertAtendimentoError) {
          setError('Erro ao salvar setores de atendimento: ' + insertAtendimentoError.message)
          setSaving(false)
          return
        }
      }

      const { error: deleteDashboardError } = await supabase
        .from('colaborador_setores')
        .delete()
        .eq('colaborador_id', editingColaborador.id)
      if (deleteDashboardError) {
        setError('Erro ao atualizar setores do dashboard: ' + deleteDashboardError.message)
        setSaving(false)
        return
      }

      if (hasDashboardAccess && formData.setores_selecionados.length > 0) {
        const dashboardRelations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: editingColaborador.id,
          setor_id: setorId,
        }))
        const { error: insertDashboardError } = await supabase.from('colaborador_setores').insert(dashboardRelations)
        if (insertDashboardError) {
          setError('Erro ao salvar setores do dashboard: ' + insertDashboardError.message)
          setSaving(false)
          return
        }
      }

      const selectedSetorIds = new Set(formData.setores_selecionados)
      const setoresAtivosAtuais = Array.isArray(editingColaborador.setores_ativos_sessao)
        ? editingColaborador.setores_ativos_sessao
        : []
      const setoresAtivosValidos = setoresAtivosAtuais.filter((setorId) => selectedSetorIds.has(setorId))

      if (setoresAtivosValidos.length !== setoresAtivosAtuais.length) {
        await supabase
          .from('colaboradores')
          .update({ setores_ativos_sessao: setoresAtivosValidos })
          .eq('id', editingColaborador.id)
      }

      toast({
        title: 'Colaborador atualizado',
        description: 'As alteracoes foram salvas com sucesso.',
      })
    } else {
      // Create new colaborador
      if (!formData.email.trim() || !formData.senha.trim()) {
        setError('E-mail e senha sao obrigatorios para novos colaboradores')
        setSaving(false)
        return
      }

      // 1. Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.senha,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/workdesk`,
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este e-mail ja esta cadastrado')
        } else {
          setError('Erro ao criar usuario: ' + authError.message)
        }
        setSaving(false)
        return
      }

      if (!authData.user) {
        setError('Erro ao criar usuario no sistema de autenticacao')
        setSaving(false)
        return
      }

      // 2. Insert into colaboradores table
      const { error: insertError } = await supabase.from('colaboradores').insert({
        id: authData.user.id,
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        setor_id: formData.setor_id || null,
        permissao_id: effectivePermissaoId,
        is_master: isAdminPermission,
        suporte_id: formData.suporte_id.trim() || null,
        is_online: false,
        ativo: true,
      })

      if (insertError) {
        setError('Erro ao cadastrar colaborador: ' + insertError.message)
        setSaving(false)
        return
      }

      // 3. Insert into colaborador_setores join table
      if (formData.setores_selecionados.length > 0) {
        const relations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: authData.user!.id,
          setor_id: setorId,
        }))
        const { error: insertAtendimentoError } = await supabase.from('colaboradores_setores').insert(relations)
        if (insertAtendimentoError) {
          setError('Erro ao salvar setores de atendimento: ' + insertAtendimentoError.message)
          setSaving(false)
          return
        }
      }

      if (hasDashboardAccess && formData.setores_selecionados.length > 0) {
        const dashboardRelations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: authData.user!.id,
          setor_id: setorId,
        }))
        const { error: insertDashboardError } = await supabase.from('colaborador_setores').insert(dashboardRelations)
        if (insertDashboardError) {
          setError('Erro ao salvar setores do dashboard: ' + insertDashboardError.message)
          setSaving(false)
          return
        }
      }

      toast({
        title: 'Colaborador criado',
        description: 'O novo colaborador foi cadastrado com sucesso.',
      })
    }

    setModalOpen(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeactivate() {
    if (!colaboradorToDeactivate) return
    if (!canDeactivateColaborador) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas administradores podem desativar ou reativar atendentes.',
        variant: 'destructive',
      })
      setDeactivateDialogOpen(false)
      setColaboradorToDeactivate(null)
      return
    }

    const newStatus = colaboradorToDeactivate.ativo ? false : true

    const { error } = await supabase
      .from('colaboradores')
      .update({ ativo: newStatus, is_online: false })
      .eq('id', colaboradorToDeactivate.id)

    if (!error) {
      toast({
        title: newStatus ? 'Colaborador reativado' : 'Colaborador desativado',
        description: newStatus
          ? 'O colaborador pode acessar o sistema novamente.'
          : 'O colaborador nao podera mais acessar o sistema.',
      })
      fetchData()
    }

    setDeactivateDialogOpen(false)
    setColaboradorToDeactivate(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Atendentes
          </h1>
          <p className="text-muted-foreground">
            Gerencie atendentes e configure de quais setores cada um recebe tickets
          </p>
        </div>
        <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center sm:mt-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nome ou e-mail"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Button
            onClick={openCreateModal}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Atendente
          </Button>
        </div>
      </div>

      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Lista de Colaboradores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : colaboradores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Nenhum colaborador cadastrado
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece cadastrando o primeiro colaborador
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Setores</TableHead>
                    <TableHead>Permissao</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>NPS</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colaboradoresFiltrados.map((colaborador) => (
                      <tr
                        key={colaborador.id}
                        className={`border-b transition-colors hover:bg-muted/50 ${
                          !colaborador.ativo ? 'opacity-50' : ''
                        }`}
                      >
                        <TableCell className="font-medium">
                          {colaborador.nome}
                          {!colaborador.ativo && (
                            <Badge variant="secondary" className="ml-2">
                              Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {colaborador.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(() => {
                            const setorIds = getSetoresDoColaborador(colaborador.id)
                            if (setorIds.length === 0) return <span className="text-muted-foreground">Nenhum</span>
                            const ativos = Array.isArray(colaborador.setores_ativos_sessao)
                              ? new Set(colaborador.setores_ativos_sessao)
                              : new Set<string>()
                            const setorItems = setorIds
                              .map((sid) => {
                                const setor = setores.find((st) => st.id === sid)
                                return setor ? { id: sid, nome: setor.nome, isAtivo: ativos.has(sid) } : null
                              })
                              .filter(Boolean) as { id: string; nome: string; isAtivo: boolean }[]
                            const visibleSetores = setorItems.slice(0, MAX_VISIBLE_SETORES)
                            const hiddenSetores = setorItems.slice(MAX_VISIBLE_SETORES)
                            const inativos = setorItems.filter((setor) => !setor.isAtivo)
                            return (
                              <div className="flex flex-wrap items-center gap-1">
                                {visibleSetores.map((setor) => (
                                  <Badge
                                    key={setor.id}
                                    variant={setor.isAtivo ? 'default' : 'outline'}
                                    className={cn(
                                      'text-xs',
                                      setor.isAtivo
                                        ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 hover:bg-green-100'
                                        : 'opacity-60 line-through',
                                    )}
                                    title={setor.isAtivo ? 'Recebendo tickets' : 'Inativo — não recebe novos tickets'}
                                  >
                                    {setor.nome}
                                  </Badge>
                                ))}
                                {hiddenSetores.length > 0 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 rounded-full px-2 text-xs text-muted-foreground"
                                    title={hiddenSetores.map((setor) => setor.nome).join(', ')}
                                    aria-label={`${hiddenSetores.length} setores adicionais: ${hiddenSetores.map((setor) => setor.nome).join(', ')}`}
                                  >
                                    +{hiddenSetores.length} mais
                                  </Button>
                                )}
                                {inativos.length > 0 && setorItems.length === inativos.length && (
                                  <span className="text-[10px] text-muted-foreground italic">
                                    nenhum ativo
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {colaborador.permissao?.nome || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Circle
                              className={`h-3 w-3 ${
                                colaborador.is_online && colaborador.ativo
                                  ? 'fill-green-500 text-green-500'
                                  : 'fill-gray-300 text-gray-300'
                              }`}
                            />
                            <span className="text-sm text-muted-foreground">
                              {colaborador.is_online && colaborador.ativo
                                ? 'Online'
                                : 'Offline'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {mediasNPS.get(colaborador.id) ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className={cn(
                                'font-semibold',
                                mediasNPS.get(colaborador.id)!.media >= 9 ? 'text-green-600' :
                                mediasNPS.get(colaborador.id)!.media >= 7 ? 'text-yellow-600' :
                                'text-red-600'
                              )}>
                                {mediasNPS.get(colaborador.id)!.media.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">({mediasNPS.get(colaborador.id)!.total})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openSetoresAtivosModal(colaborador)}
                              className="hover:bg-primary/20"
                              disabled={getSetoresDoColaborador(colaborador.id).length === 0}
                              title={
                                getSetoresDoColaborador(colaborador.id).length === 0
                                  ? 'Vincule pelo menos 1 setor antes de configurar'
                                  : 'Escolher de quais setores este atendente recebe tickets'
                              }
                            >
                              <Building2 className="mr-1 h-4 w-4" />
                              Setores
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(colaborador)}
                              className="hover:bg-primary/20"
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            {canDeactivateColaborador && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeactivateDialog(colaborador)}
                                className={
                                  colaborador.ativo
                                    ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                    : 'text-green-600 hover:bg-green-100 hover:text-green-600'
                                }
                              >
                                <UserX className="mr-1 h-4 w-4" />
                                {colaborador.ativo ? 'Desativar' : 'Reativar'}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </tr>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal for Create/Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="glass-card-elevated rounded-3xl border-0 sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              {editingColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="nome" className="text-foreground">
                Nome *
              </Label>
              <Input
                id="nome"
                placeholder="Nome completo"
                value={formData.nome}
                onChange={(e) =>
                  setFormData({ ...formData, nome: e.target.value })
                }
                className="border-border bg-card"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email" className="text-foreground">
                E-mail *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@empresa.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={!!editingColaborador}
                className="border-border bg-card disabled:opacity-50"
              />
              {editingColaborador && (
                <p className="text-xs text-muted-foreground">
                  O e-mail nao pode ser alterado
                </p>
              )}
            </div>

            {!editingColaborador && (
              <div className="grid gap-2">
                <Label htmlFor="senha" className="text-foreground">
                  Senha *
                </Label>
                <Input
                  id="senha"
                  type="password"
                  placeholder="Senha de acesso"
                  value={formData.senha}
                  onChange={(e) =>
                    setFormData({ ...formData, senha: e.target.value })
                  }
                  className="border-border bg-card"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="suporte_id" className="text-foreground">
                ID Suporte (opcional)
              </Label>
              <Input
                id="suporte_id"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ex: 12345"
                value={formData.suporte_id}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  setFormData({ ...formData, suporte_id: value })
                }}
                className="border-border bg-card"
              />
              <p className="text-xs text-muted-foreground">
                ID do atendente no sistema externo de suporte
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-foreground">
                  Setores
                </Label>
                <span className="text-xs text-muted-foreground">
                  {formData.setores_selecionados.length} de {setores.length} selecionado(s)
                </span>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={setorSearchTerm}
                      onChange={(event) => setSetorSearchTerm(event.target.value)}
                      placeholder="Buscar setor"
                      className="h-9 pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectFilteredSetores}
                      disabled={setoresFiltrados.length === 0}
                    >
                      Selecionar visíveis
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelectedSetores}
                      disabled={formData.setores_selecionados.length === 0}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>

                {setoresSelecionados.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {setoresSelecionados.slice(0, 5).map((setor) => (
                      <Badge key={setor.id} variant="secondary" className="text-xs">
                        {setor.nome}
                      </Badge>
                    ))}
                    {setoresSelecionados.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{setoresSelecionados.length - 5} mais
                      </Badge>
                    )}
                  </div>
                )}

                <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {setores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
                  ) : setoresFiltrados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum setor encontrado</p>
                  ) : (
                    setoresFiltrados.map((setor) => {
                      const isSelected = formData.setores_selecionados.includes(setor.id)
                      return (
                        <div
                          key={setor.id}
                          className={cn(
                            'flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background hover:bg-muted/60 text-foreground',
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSetorSelection(setor.id)}
                            id={`setor-${setor.id}`}
                          />
                          <label
                            htmlFor={`setor-${setor.id}`}
                            className="min-w-0 flex-1 cursor-pointer truncate"
                          >
                            {setor.nome}
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              {setorSearchTerm && (
                <p className="text-xs text-muted-foreground">
                  Mostrando {setoresFiltrados.length} resultado(s) para &quot;{setorSearchTerm}&quot;
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="permissao" className="text-foreground">
                Permissao
              </Label>
              <Select
                value={canManagePermissionLevel ? formData.permissao_id : formData.permissao_id || atendentePermissao?.id || ''}
                onValueChange={(value) =>
                  canManagePermissionLevel && setFormData({ ...formData, permissao_id: value })
                }
                disabled={!canManagePermissionLevel}
              >
                <SelectTrigger className="border-border bg-card">
                  <SelectValue placeholder="Selecione uma permissao" />
                </SelectTrigger>
                <SelectContent>
                  {permissoesDisponiveis.map((permissao) => (
                    <SelectItem key={permissao.id} value={permissao.id}>
                      {permissao.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canManagePermissionLevel && (
                <p className="text-xs text-muted-foreground">
                  Supervisores podem gerenciar atendentes, mas nao podem alterar nivel de permissao.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.nome.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingColaborador ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Configurar Setores Ativos */}
      <Dialog open={setoresAtivosModalOpen} onOpenChange={setSetoresAtivosModalOpen}>
        <DialogContent className="glass-card-elevated rounded-3xl border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              Configurar setores
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {colaboradorSetoresAtivos
                ? <>Escolha de quais setores <strong className="text-foreground">{colaboradorSetoresAtivos.nome}</strong> vai receber novos tickets. Tickets já em andamento permanecem com ele.</>
                : 'Carregando...'}
            </p>

            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {(() => {
                if (!colaboradorSetoresAtivos) return null
                const setorIds = getSetoresDoColaborador(colaboradorSetoresAtivos.id)
                if (setorIds.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Atendente não está vinculado a nenhum setor.
                    </p>
                  )
                }
                return setorIds.map((sid) => {
                  const setor = setores.find(s => s.id === sid)
                  if (!setor) return null
                  const checked = setoresAtivosSelecionados.has(sid)
                  return (
                    <label
                      key={sid}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                        checked
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:bg-muted/50',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSetorAtivoCheckbox(sid)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{setor.nome}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {checked ? 'Recebe tickets' : 'Não recebe novos tickets'}
                        </p>
                      </div>
                    </label>
                  )
                })
              })()}
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              <strong className="text-foreground">{setoresAtivosSelecionados.size}</strong> setor(es) selecionado(s).
              Atendente sem nenhum setor ativo não receberá tickets, mesmo estando online.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSetoresAtivosModalOpen(false)}
              disabled={savingSetoresAtivos}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveSetoresAtivos}
              disabled={savingSetoresAtivos}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {savingSetoresAtivos ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent className="glass-card-elevated rounded-2xl border-0">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {colaboradorToDeactivate?.ativo
                ? 'Desativar colaborador?'
                : 'Reativar colaborador?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {colaboradorToDeactivate?.ativo
                ? `O colaborador "${colaboradorToDeactivate?.nome}" nao podera mais acessar o sistema. Voce podera reativa-lo a qualquer momento.`
                : `O colaborador "${colaboradorToDeactivate?.nome}" podera acessar o sistema novamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={
                colaboradorToDeactivate?.ativo
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }
            >
              {colaboradorToDeactivate?.ativo ? 'Desativar' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
