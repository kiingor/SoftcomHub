'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// Colaborador data hook
export function useColaborador() {
  return useSWR(
    'colaborador',
    async () => {
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

// Setores data hook
export function useSetores(colaboradorId?: string, isMaster?: boolean) {
  return useSWR(
    colaboradorId ? ['setores', colaboradorId, isMaster] : null,
    async () => {
      if (isMaster) {
        const { data } = await supabase
          .from('setores')
          .select('*, setor_canais(tipo, ativo), tags(id, nome, cor)')
          .order('nome')
        return data || []
      }

      const { data: assignments } = await supabase
        .from('colaborador_setores')
        .select('setor_id, setores(*, setor_canais(tipo, ativo), tags(id, nome, cor))')
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
      refreshInterval: 10000,
    }
  )
}

// Colaboradores for a setor
export function useSetorColaboradores(setorId: string) {
  return useSWR(
    setorId ? ['setor-colaboradores', setorId] : null,
    async () => {
      const { data } = await supabase
        .from('colaboradores')
        .select('id, nome, email, is_online, ativo')
        .eq('setor_id', setorId)
        .eq('ativo', true)
      return data || []
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 5000,
    }
  )
}

// All colaboradores (for admin)
export function useAllColaboradores() {
  return useSWR(
    'all-colaboradores',
    async () => {
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
