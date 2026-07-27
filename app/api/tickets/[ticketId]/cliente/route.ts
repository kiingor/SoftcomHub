import { NextRequest, NextResponse } from 'next/server'
import { documentoVariants, isDocumentoValido, normalizeDocumento } from '@/lib/documento-cliente'
import { lookupSoftcomClientByCnpj } from '@/lib/softcom-client'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const CLIENT_SELECT = 'id, nome, telefone, email, CNPJ, Registro, PDV, software, prime'

interface ClienteSnapshot {
  id: string
  nome: string | null
  CNPJ: string | null
  Registro: string | null
  PDV: string | null
}

function phoneVariants(phone: string | null) {
  const digits = phone?.replace(/\D/g, '') || ''
  if (!digits) return []

  const withoutCountryCode = digits.startsWith('55') ? digits.slice(2) : digits
  return [...new Set([digits, withoutCountryCode, `55${withoutCountryCode}`])]
}

function toClientResponse(cliente: Record<string, any>) {
  const cnpj = cliente.CNPJ ?? null
  const registro = cliente.Registro ?? null
  const pdv = cliente.PDV ?? null

  return {
    id: cliente.id,
    nome: cliente.nome || 'Cliente sem nome',
    telefone: cliente.telefone ?? null,
    email: cliente.email ?? null,
    CNPJ: cnpj,
    Registro: registro,
    PDV: pdv,
    // Sincronizados externamente; ficam null para cliente vindo da busca externa.
    software: cliente.software ?? null,
    prime: cliente.prime ?? null,
    cnpj,
    registro,
    pdv,
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const supabase = createServiceClient()

    const { ticketId } = await params
    const body = await request.json().catch(() => null)
    // O campo continua chamando `cnpj` no contrato, mas aceita CNPJ ou CPF (MEI).
    const normalizedDocumento = normalizeDocumento(body?.cnpj)
    if (!isDocumentoValido(normalizedDocumento)) {
      return NextResponse.json({ error: 'Informe um CNPJ ou CPF válido' }, { status: 400 })
    }

    const { data: actor, error: actorError } = await supabase
      .from('colaboradores')
      .select('id, ativo')
      .eq('email', user.email)
      .maybeSingle()

    if (actorError || !actor?.ativo) {
      console.error('[tickets/cliente] Colaborador não encontrado:', actorError)
      return NextResponse.json({ error: 'Você não tem permissão para vincular clientes' }, { status: 403 })
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, colaborador_id')
      .eq('id', ticketId)
      .maybeSingle()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
    }

    if (ticket.colaborador_id !== actor.id) {
      return NextResponse.json({ error: 'Você não pode alterar este ticket' }, { status: 403 })
    }

    const { data: localClientes, error: localError } = await supabase
      .from('clientes')
      .select(CLIENT_SELECT)
      .in('CNPJ', documentoVariants(normalizedDocumento))
      .limit(1)

    if (localError) {
      console.error('[tickets/cliente] Erro ao consultar cliente local:', localError)
      return NextResponse.json({ error: 'Não foi possível consultar o cliente' }, { status: 500 })
    }

    let cliente = localClientes?.[0] ?? null
    let createdClienteId: string | null = null
    let previousClienteData: ClienteSnapshot | null = null
    if (!cliente) {
      const externalCliente = await lookupSoftcomClientByCnpj(normalizedDocumento)
      if (!externalCliente) {
        return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
      }

      const phones = phoneVariants(externalCliente.telefone)
      let clientePorTelefone = null
      if (phones.length > 0) {
        const { data: clientesPorTelefone, error: phoneLookupError } = await supabase
          .from('clientes')
          .select(CLIENT_SELECT)
          .in('telefone', phones)
          .limit(2)

        if (phoneLookupError) {
          console.error('[tickets/cliente] Erro ao consultar cliente pelo telefone:', phoneLookupError)
          return NextResponse.json({ error: 'Não foi possível consultar o cliente' }, { status: 500 })
        }

        if ((clientesPorTelefone?.length ?? 0) > 1) {
          return NextResponse.json(
            { error: 'Há mais de um cadastro com este telefone. Revise o cliente antes de vincular.' },
            { status: 409 },
          )
        }

        clientePorTelefone = clientesPorTelefone?.[0] ?? null
        if (
          clientePorTelefone?.CNPJ
          && normalizeDocumento(clientePorTelefone.CNPJ) !== normalizedDocumento
        ) {
          return NextResponse.json(
            { error: 'Este telefone já está vinculado a outro CNPJ/CPF.' },
            { status: 409 },
          )
        }
      }

      if (clientePorTelefone) {
        previousClienteData = clientePorTelefone
        const { data: updatedCliente, error: clienteUpdateError } = await supabase
          .from('clientes')
          .update({
            nome: externalCliente.nome === 'Cliente sem nome'
              ? clientePorTelefone.nome
              : externalCliente.nome,
            CNPJ: externalCliente.CNPJ,
            Registro: externalCliente.Registro ?? clientePorTelefone.Registro ?? null,
            PDV: externalCliente.PDV ?? clientePorTelefone.PDV ?? null,
          })
          .eq('id', clientePorTelefone.id)
          .select(CLIENT_SELECT)
          .single()

        if (clienteUpdateError || !updatedCliente) {
          console.error('[tickets/cliente] Erro ao atualizar cliente pelo telefone:', clienteUpdateError)
          return NextResponse.json({ error: 'Não foi possível atualizar o cliente' }, { status: 500 })
        }

        cliente = updatedCliente
      } else {
        const { data: insertedCliente, error: insertError } = await supabase
          .from('clientes')
          .insert(externalCliente)
          .select(CLIENT_SELECT)
          .single()

        if (insertError || !insertedCliente) {
          console.error('[tickets/cliente] Erro ao persistir cliente externo:', insertError)
          return NextResponse.json({ error: 'Não foi possível salvar o cliente' }, { status: 500 })
        }

        cliente = insertedCliente
        createdClienteId = insertedCliente.id
      }
    }

    const updateTicketQuery = supabase
      .from('tickets')
      .update({ cliente_id: cliente.id })
      .eq('id', ticketId)
      .eq('colaborador_id', actor.id)

    const { data: updatedTicket, error: updateError } = await updateTicketQuery
      .select('id, cliente_id')
      .single()

    if (updateError || !updatedTicket || updatedTicket.cliente_id !== cliente.id) {
      console.error('[tickets/cliente] Erro ao vincular cliente ao ticket:', updateError)
      if (createdClienteId) {
        const { error: cleanupError } = await supabase
          .from('clientes')
          .delete()
          .eq('id', createdClienteId)
        if (cleanupError) {
          console.error('[tickets/cliente] Erro ao remover cliente sem vínculo:', cleanupError)
        }
      }
      if (previousClienteData) {
        const { error: rollbackError } = await supabase
          .from('clientes')
          .update({
            nome: previousClienteData.nome,
            CNPJ: previousClienteData.CNPJ,
            Registro: previousClienteData.Registro,
            PDV: previousClienteData.PDV,
          })
          .eq('id', previousClienteData.id)
        if (rollbackError) {
          console.error('[tickets/cliente] Erro ao restaurar cliente após falha:', rollbackError)
        }
      }
      return NextResponse.json({ error: 'Não foi possível vincular o cliente ao ticket' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
      cliente: toClientResponse(cliente),
    })
  } catch (error) {
    console.error('[tickets/cliente] Erro:', error)
    return NextResponse.json({ error: 'Erro interno ao vincular o cliente' }, { status: 500 })
  }
}
