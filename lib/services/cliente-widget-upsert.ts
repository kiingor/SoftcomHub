import { createServiceClient } from '@/lib/supabase'

export interface ClienteUpsertInput {
  telefone?: string
  nome: string
  cnpj?: string
}

export interface ClienteUpsertResult {
  cliente_id: string
  status: 'criado' | 'encontrado' | 'atualizado'
  cliente: {
    id: string
    nome: string
    telefone: string
    cnpj: string | null
  }
}

/**
 * Normaliza telefone: remove máscara e garante o DDI 55 (Brasil).
 */
export function normalizarTelefone(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')
  return digitos.startsWith('55') ? digitos : '55' + digitos
}

/**
 * Resolve o cliente por TELEFONE (caminho padrão) ou, quando o cliente não
 * quer informar o telefone, por CNPJ. Cria se não existir.
 */
export async function clienteWidgetUpsert(
  input: ClienteUpsertInput,
): Promise<ClienteUpsertResult> {
  const supabase = createServiceClient()
  const { nome } = input
  const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : undefined
  const telefone = input.telefone ? normalizarTelefone(input.telefone) : null

  try {
    // ---------- Identidade por TELEFONE ----------
    if (telefone) {
      const { data: existentes } = await supabase
        .from('clientes')
        .select('id, nome, telefone, CNPJ')
        .eq('telefone', telefone)

      const existente = existentes && existentes.length > 0 ? existentes[0] : null

      if (existente) {
        let status: 'encontrado' | 'atualizado' = 'encontrado'
        if (!(existente as any).CNPJ && cnpj) {
          await supabase.from('clientes').update({ CNPJ: cnpj }).eq('id', existente.id)
          status = 'atualizado'
        }
        return {
          cliente_id: existente.id,
          status,
          cliente: {
            id: existente.id,
            nome: existente.nome,
            telefone: existente.telefone || telefone,
            cnpj: (existente as any).CNPJ || cnpj || null,
          },
        }
      }

      const { data: novo, error } = await supabase
        .from('clientes')
        .insert({ nome, telefone, CNPJ: cnpj || null })
        .select('id, nome, telefone, CNPJ')
        .single()
      if (error) throw new Error(`Erro ao criar cliente: ${error.message}`)

      return {
        cliente_id: novo.id,
        status: 'criado',
        cliente: {
          id: novo.id,
          nome: novo.nome,
          telefone: novo.telefone || telefone,
          cnpj: (novo as any).CNPJ,
        },
      }
    }

    // ---------- Identidade por CNPJ ----------
    if (cnpj) {
      const { data: porCnpj } = await supabase
        .from('clientes')
        .select('id, nome, telefone, CNPJ')
        .eq('CNPJ', cnpj)
        .limit(1)

      const existente = porCnpj && porCnpj.length > 0 ? porCnpj[0] : null
      if (existente) {
        return {
          cliente_id: existente.id,
          status: 'encontrado',
          cliente: {
            id: existente.id,
            nome: existente.nome,
            telefone: existente.telefone || '',
            cnpj,
          },
        }
      }

      const { data: novo, error } = await supabase
        .from('clientes')
        .insert({ nome, CNPJ: cnpj })
        .select('id, nome, telefone, CNPJ')
        .single()
      if (error) throw new Error(`Erro ao criar cliente: ${error.message}`)

      return {
        cliente_id: novo.id,
        status: 'criado',
        cliente: {
          id: novo.id,
          nome: novo.nome,
          telefone: novo.telefone || '',
          cnpj,
        },
      }
    }

    throw new Error('Informe telefone ou CNPJ para identificar o cliente')
  } catch (error) {
    console.error('clienteWidgetUpsert error:', error)
    throw error
  }
}
