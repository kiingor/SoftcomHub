'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

// Colaborador + Setores combined hook to avoid waterfall (used by dashboard page)
export function useDashboardData() {
  return useSWR(
    'dashboard-data',
    async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // Fetch colaborador and setores in parallel
      const [colabResult, setoresResult] = await Promise.all([
        supabase
          .from('colaboradores')
          .select('id, nome, email, is_master, is_online, ativo, permissao_id, setor_id, permissoes:permissao_id(*)')
          .eq('email', user.email)
          .maybeSingle(),
        supabase
          .from('setores')
          .select('*, setor_canais(tipo, ativo), tags(id, nome, cor, ordem)')
          .order('nome'),
      ])

      const colaborador = colabResult.data
      let setores = setoresResult.data || []

      // If not master, filter to assigned setores
      if (colaborador && !colaborador.is_master) {
        const { data: assignments } = await supabase
          .from('colaborador_setores')
          .select('setor_id')
          .eq('colaborador_id', colaborador.id)

        const assignedIds = new Set(assignments?.map((a) => a.setor_id) || [])
        setores = setores.filter((s: { id: string }) => assignedIds.has(s.id))
      }

      return { colaborador, setores }
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )
}

// Individual hooks for other pages
export function useColaborador() {
  return useSWR(
    'colaborador',
    async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data } = await supabase
        .from('colaboradores')
        .select('id, nome, email, is_master, is_online, ativo, permissao_id, setor_id, permissoes:permissao_id(*)')
        .eq('email', user.email)
        .maybeSingle()

      return data
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )
}

export function useSetores(colaboradorId?: string, isMaster?: boolean) {
  return useSWR(
    colaboradorId ? ['setores', colaboradorId, isMaster] : null,
    async () => {
      const supabase = createClient()
      if (isMaster) {
        const { data } = await supabase
          .from('setores')
          .select('*, setor_canais(tipo, ativo), tags(id, nome, cor, ordem)')
          .order('nome')
        return data || []
      }

      const { data: assignments } = await supabase
        .from('colaborador_setores')
        .select('setor_id, setores(*, setor_canais(tipo, ativo), tags(id, nome, cor, ordem))')
        .eq('colaborador_id', colaboradorId)

      return assignments?.map((a) => a.setores).filter(Boolean) || []
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )
}

// Single setor data hook
export function useSetor(setorId: string) {
  return useSWR(
    setorId ? ['setor', setorId] : null,
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('setores')
        .select('*')
        .eq('id', setorId)
        .single()
      return data
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )
}

// Tickets for a setor
export function useSetorTickets(setorId: string) {
  return useSWR(
    setorId ? ['setor-tickets', setorId] : null,
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tickets')
        .select(`
          *,
          clientes:cliente_id(nome, telefone),
          colaboradores:colaborador_id(nome)
        `)
        .eq('setor_id', setorId)
        .order('created_at', { ascending: false })
      return data || []
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 30000, // reduzido de 10s para 30s — otimização de polling Supabase
    }
  )
}

// Colaboradores for a setor
export function useSetorColaboradores(setorId: string) {
  return useSWR(
    setorId ? ['setor-colaboradores', setorId] : null,
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('colaboradores')
        .select('id, nome, email, is_online, ativo')
        .eq('setor_id', setorId)
        .eq('ativo', true)
      return data || []
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 30000, // reduzido de 5s para 30s — otimização de polling Supabase
    }
  )
}

// All colaboradores (for admin)
export function useAllColaboradores() {
  return useSWR(
    'all-colaboradores',
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('colaboradores')
        .select(`
          *,
          setores:setor_id(nome),
          permissoes:permissao_id(nome)
        `)
        .order('nome')
      return data || []
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )
}

// All setores (for admin)
export function useAllSetores() {
  return useSWR(
    'all-setores',
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('setores')
        .select('*')
        .order('nome')
      return data || []
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )
}

// Permissoes
export function usePermissoes() {
  return useSWR(
    'permissoes',
    async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('permissoes')
        .select('*')
        .order('nome')
      return data || []
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )
}
