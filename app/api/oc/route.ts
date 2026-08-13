// Veredito de OC para um ticket do Hub — caso #97240.
//
// Existe por dois motivos: a `SOFTCOM_API_KEY` não pode vazar para o navegador,
// e a flag que liga a trava é de servidor (ligar/desligar sem novo deploy).
// A tela só obedece ao `podeEncerrar` que sai daqui.
//
// Fail-open é regra, não detalhe: TODO caminho de erro desta rota devolve
// `podeEncerrar: true`. Nada aqui pode virar fila parada.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarOcDoTicket } from '@/lib/oc-ticket-consulta'
import {
  decidirEncerramento,
  ocObrigatoriaLigada,
  type ConsultaOc,
} from '@/lib/oc-ticket'

export async function GET(request: NextRequest) {
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

    // Acesso estático a `process.env` de propósito — é o que o Next substitui
    // de forma confiável em qualquer runtime.
    const flagLigada = ocObrigatoriaLigada(process.env.OC_OBRIGATORIA_PARA_ENCERRAR)

    // Flag desligada = comportamento de hoje. Nem chega a bater na API externa.
    const consulta: ConsultaOc | null = flagLigada ? await consultarOcDoTicket(numero) : null
    const decisao = decidirEncerramento(flagLigada, consulta)

    if (decisao.aviso) {
      console.warn(
        `[oc] ticket ${numero}: não deu para verificar a OC — ${decisao.aviso}. Encerramento liberado.`,
      )
    }

    return NextResponse.json({
      flagLigada,
      situacao: consulta?.situacao ?? 'indeterminado',
      identificacao: consulta?.identificacao ?? null,
      podeEncerrar: decisao.permite,
      bloqueio: decisao.bloqueio,
    })
  } catch (error) {
    console.warn('[oc] falha inesperada ao verificar a OC; encerramento liberado:', error)
    return NextResponse.json({
      flagLigada: false,
      situacao: 'indeterminado',
      identificacao: null,
      podeEncerrar: true,
      bloqueio: null,
    })
  }
}
