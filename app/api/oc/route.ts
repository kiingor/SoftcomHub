// Veredito de OC para um ticket do Hub — caso #97240.
//
// Existe por dois motivos: a `SOFTCOM_API_KEY` não pode vazar para o navegador,
// e a exigência é decidida no servidor (ligar/desligar sem novo deploy).
// A tela só obedece ao `podeEncerrar` que sai daqui.
//
// Fail-open é regra, não detalhe: TODO caminho de erro desta rota devolve
// `podeEncerrar: true`. Nada aqui pode virar fila parada.
//
// A exigência tem três níveis, resolvidos por `exigirOcNoTicket`:
// flag global (env) -> opt-in do setor (banco) -> isenção de disparo (ticket).
// Só se os três permitirem é que a API externa chega a ser consultada.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarOcDoTicket } from '@/lib/oc-ticket-consulta'
import {
  decidirEncerramento,
  exigirOcNoTicket,
  ocObrigatoriaLigada,
  ticketEhDisparo,
  type ConsultaOc,
} from '@/lib/oc-ticket'

/** Colunas do ticket que a decisão precisa, fora o vínculo com o setor. */
const CAMPOS_TICKET = 'numero, setor_id, is_disparo, disparo_em'

interface ContextoTicket {
  ehDisparo: boolean
  setorExige: boolean | null
}

/**
 * Lê o opt-in de dentro do embed do setor.
 *
 * Aceita objeto OU array de propósito: o PostgREST devolve um ou outro conforme
 * ele enxerga a relação, e errar isso aqui seria pior que barulhento — seria
 * silencioso. `setorExige` viraria `null` para sempre e o recurso não ligaria
 * nem depois da migration.
 */
function lerOptInDoSetor(setores: unknown): boolean | null {
  const registro = Array.isArray(setores) ? setores[0] : setores
  if (!registro || typeof registro !== 'object') return null
  const valor = (registro as { oc_obrigatoria_para_encerrar?: unknown }).oc_obrigatoria_para_encerrar
  return typeof valor === 'boolean' ? valor : null
}

/**
 * Carrega o ticket e o opt-in do setor dele.
 *
 * A coluna `setores.oc_obrigatoria_para_encerrar` pode ainda não existir no
 * ambiente (rollout de coluna pendente) — mesmo cuidado que a tela de setor já
 * toma com `travar_ordenacao_chat`. Se o embed falhar, relê sem ele: o ticket
 * continua respondendo pela isenção de disparo, e o setor fica como "não exige".
 */
async function carregarContexto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  numero: string,
): Promise<ContextoTicket | null> {
  const comSetor = await supabase
    .from('tickets')
    .select(`${CAMPOS_TICKET}, setores:setor_id(oc_obrigatoria_para_encerrar)`)
    .eq('numero', numero)
    .maybeSingle()

  if (!comSetor.error) {
    if (!comSetor.data) return null
    return {
      ehDisparo: ticketEhDisparo(comSetor.data),
      setorExige: lerOptInDoSetor(comSetor.data.setores),
    }
  }

  console.warn(
    '[oc] não deu para ler o opt-in do setor; tratando como "não exige":',
    comSetor.error.message,
  )

  const semSetor = await supabase
    .from('tickets')
    .select(CAMPOS_TICKET)
    .eq('numero', numero)
    .maybeSingle()

  if (semSetor.error || !semSetor.data) return null
  return { ehDisparo: ticketEhDisparo(semSetor.data), setorExige: null }
}

export async function GET(request: NextRequest) {
  // Acesso estático a `process.env` de propósito — é o que o Next substitui
  // de forma confiável em qualquer runtime.
  const flagGlobal = ocObrigatoriaLigada(process.env.OC_OBRIGATORIA_PARA_ENCERRAR)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const numero = (request.nextUrl.searchParams.get('numero') || '').trim()
    if (!/^\d+$/.test(numero)) {
      return NextResponse.json({ error: 'Informe o número do ticket' }, { status: 400 })
    }

    // Flag desligada = comportamento de hoje. Nem lê o ticket, nem bate na API.
    const contexto = flagGlobal ? await carregarContexto(supabase, numero) : null
    const exigencia = exigirOcNoTicket({
      flagGlobal,
      setorExige: contexto?.setorExige,
      ehDisparo: contexto?.ehDisparo ?? false,
    })

    const consulta: ConsultaOc | null = exigencia ? await consultarOcDoTicket(numero) : null
    const decisao = decidirEncerramento(exigencia, consulta)

    if (decisao.aviso) {
      console.warn(
        `[oc] ticket ${numero}: não deu para verificar a OC — ${decisao.aviso}. Encerramento liberado.`,
      )
    }

    return NextResponse.json({
      // Global: a tela usa este campo para desistir de consultar pelo resto da
      // sessão. NÃO pode virar "vale para este ticket" — senão o primeiro
      // disparo isento desligaria a checagem de todos os tickets seguintes.
      flagLigada: flagGlobal,
      /** A exigência vale para ESTE ticket (setor optou e não é disparo). */
      exigencia,
      situacao: consulta?.situacao ?? 'indeterminado',
      identificacao: consulta?.identificacao ?? null,
      podeEncerrar: decisao.permite,
      bloqueio: decisao.bloqueio,
    })
  } catch (error) {
    console.warn('[oc] falha inesperada ao verificar a OC; encerramento liberado:', error)
    return NextResponse.json({
      flagLigada: flagGlobal,
      exigencia: false,
      situacao: 'indeterminado',
      identificacao: null,
      podeEncerrar: true,
      bloqueio: null,
    })
  }
}
