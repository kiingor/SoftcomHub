import { NextResponse } from 'next/server'
import { resolverProvedorDeChat } from '@/lib/ai-provider'
import {
  analiseContinuaValida,
  assinarConversa,
  calcularMetricasDeTempo,
  extrairDeltasSse,
  LIMITE_MENSAGENS_ANALISE,
  montarEntradaDaAnalise,
  montarTranscricao,
  PROMPT_STATUS_ATENDIMENTO,
  VERSAO_PROMPT_STATUS_ATENDIMENTO,
  type AnaliseSalva,
  type MensagemParaAnalise,
} from '@/lib/analise-atendimento'
import {
  calcularInicioJanelaHistoricoIso,
  selecionarIdsContextoNexusOrfao,
} from '@/lib/nexus-historico-ticket'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  assinarConteudoAnalisado,
  reservarGeracaoStatusAtendimento,
  type MetadadosPromptStatusAtendimento,
} from '@/lib/server/status-atendimento-analise'

/**
 * POST /api/ia/status-atendimento
 *
 * A leitura de IA de um atendimento, para o botão "Status do atendimento" do
 * Monitoramento do setor. Devolve markdown com as seções que o diálogo
 * renderiza (ver `PROMPT_STATUS_ATENDIMENTO`).
 *
 * O resultado é guardado em `ticket_analises_ia` com assinatura da entrada
 * efetivamente enviada ao modelo. Reabrir o diálogo sem mudança na conversa ou
 * no contexto devolve o texto salvo; `forcar: true` ignora o cache, mas respeita
 * o intervalo mínimo entre gerações.
 *
 * Body:
 * - ticket_id: string (obrigatório)
 * - forcar: boolean (opcional) — ignora o cache e reanalisa
 */

// O padrão da Vercel corta a função em ~10-15s. A análise leva de 6 a 11s
// medidos (consultas + LLM) e o timeout interno abaixo é de 45s: sem declarar
// isto, a plataforma mataria a requisição antes do nosso próprio timeout, e o
// streaming morreria no meio.
export const maxDuration = 60
// Streaming pela Web API de Response; o runtime Node é o que este projeto usa
// nas demais rotas com trabalho pesado.
export const runtime = 'nodejs'

/** A análise lê a conversa inteira; o timeout de 10s das outras rotas de IA não serve. */
const TIMEOUT_IA_MS = 45_000

/** Um evento do nosso próprio SSE para o painel. */
function sse(evento: string, dados: unknown): string {
  return `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`
}

const CABECALHOS_SSE = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // O proxy da Vercel bufferiza sem isto, e o streaming vira um bloco só no fim.
  'X-Accel-Buffering': 'no',
} as const

/** Um SSE de uma mensagem só, para erro e para resposta que veio do cache. */
function respostaSseImediata(
  eventos: Array<[string, unknown]>,
  status = 200,
  cabecalhos: HeadersInit = {},
): Response {
  const corpo = eventos.map(([nome, dados]) => sse(nome, dados)).join('')
  return new Response(corpo, {
    status,
    headers: { ...CABECALHOS_SSE, ...cabecalhos },
  })
}

const COLUNAS_ANALISE = [
  'markdown',
  'ultima_mensagem_id',
  'ultima_mensagem_em',
  'total_mensagens',
  'modelo',
  'gerado_em',
  'assinatura_conteudo',
  'versao_prompt',
].join(', ')

type MensagemDoBanco = MensagemParaAnalise & { ticket_id: string | null }

/**
 * A tabela de cache é aplicada à mão no Supabase Studio, como as demais
 * migrations do projeto. Enquanto ela não existir, a análise continua
 * funcionando — só sem economizar chamadas.
 */
async function lerAnaliseSalva(
  db: ReturnType<typeof createServiceClient>,
  ticketId: string,
): Promise<AnaliseSalva | null> {
  const { data, error } = await db
    .from('ticket_analises_ia')
    .select(COLUNAS_ANALISE)
    .eq('ticket_id', ticketId)
    .maybeSingle()

  if (error) {
    console.warn('[StatusAtendimento] cache indisponível na leitura:', error.message)
    return null
  }

  return (data as AnaliseSalva | null) ?? null
}

async function salvarAnalise(
  db: ReturnType<typeof createServiceClient>,
  linha: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from('ticket_analises_ia')
    .upsert(linha, { onConflict: 'ticket_id' })

  if (error) {
    console.warn('[StatusAtendimento] cache indisponível na gravação:', error.message)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const ticketId: string | undefined = body?.ticket_id
    const forcar = body?.forcar === true
    const emStream = body?.stream === true

    // Em streaming o status HTTP já foi para 200 quando o texto começa a sair,
    // então a falha precisa viajar como evento. Antes disso, um JSON normal
    // serviria — mas manter um caminho só evita divergência entre os dois.
    const falha = (
      mensagem: string,
      status: number,
      detalhes: Record<string, unknown> = {},
      cabecalhos: HeadersInit = {},
    ) => {
      const corpo = { error: mensagem, ...detalhes }
      return emStream
        ? respostaSseImediata([['erro', corpo]], status, cabecalhos)
        : NextResponse.json(corpo, { status, headers: cabecalhos })
    }

    if (!ticketId) return falha('ticket_id é obrigatório', 400)

    const sessao = await createClient()
    const { data: { user } } = await sessao.auth.getUser()
    if (!user) return falha('Unauthorized', 401)

    const db = createServiceClient()

    const { data: ticket, error: ticketError } = await db
      .from('tickets')
      .select('id, numero, setor_id, status, criado_em, cliente_id, colaborador_id')
      .eq('id', ticketId)
      .maybeSingle()

    if (ticketError) {
      console.error('[StatusAtendimento] erro ao buscar ticket:', ticketError.message)
      return falha('Erro ao buscar o ticket', 500)
    }
    if (!ticket) return falha('Ticket não encontrado', 404)

    const { data: setor, error: setorError } = await db
      .from('setores')
      .select('openai_api_key, openai_ativo, openai_url_personalizada, openai_base_url')
      .eq('id', ticket.setor_id)
      .maybeSingle()

    if (setorError) {
      console.error('[StatusAtendimento] erro ao buscar setor:', setorError.message)
      return falha('Erro ao buscar o setor', 500)
    }
    if (!setor) return falha('Setor não encontrado', 404)

    const provedor = resolverProvedorDeChat(setor)
    if (!provedor) {
      return falha(
        'A IA da análise não está configurada. Defina ANALISE_IA_API_KEY'
        + ' ou ative a IA em Setor → Configurações.',
        400,
      )
    }

    const { data: cliente, error: clienteError } = await db
      .from('clientes')
      .select('id, nome, telefone')
      .eq('id', ticket.cliente_id)
      .maybeSingle()

    if (clienteError) {
      console.warn('[StatusAtendimento] erro ao buscar cliente:', clienteError.message)
    }

    const mensagens = await carregarConversa(db, ticket, cliente?.telefone ?? null)

    if (mensagens.length === 0) {
      return falha('Este atendimento ainda não tem mensagens para analisar.', 409)
    }

    const assinatura = assinarConversa(mensagens)
    // Aritmética sobre os carimbos das mensagens: sai de graça e sempre igual,
    // então é recalculada mesmo quando o texto vem do cache.
    const metricas = calcularMetricasDeTempo(mensagens)

    const { data: atendente, error: atendenteError } = ticket.colaborador_id
      ? await db.from('colaboradores').select('nome').eq('id', ticket.colaborador_id).maybeSingle()
      : { data: null, error: null }

    if (atendenteError) {
      console.warn('[StatusAtendimento] erro ao buscar atendente:', atendenteError.message)
    }

    const transcricao = montarTranscricao(mensagens)
    if (!transcricao) {
      return falha('As mensagens deste atendimento não têm conteúdo legível para analisar.', 409)
    }

    const clienteDoPrompt = cliente?.nome || cliente?.telefone || null
    const atendenteDoPrompt = atendente?.nome ?? null
    const entradaDaAnalise = montarEntradaDaAnalise({
      numero: ticket.numero,
      cliente: clienteDoPrompt,
      atendente: atendenteDoPrompt,
      status: ticket.status,
      abertoEm: ticket.criado_em,
      transcricao,
    })
    const metadadosPrompt: MetadadosPromptStatusAtendimento = {
      ticket: {
        id: ticket.id,
        numero: ticket.numero ?? null,
        status: ticket.status ?? null,
        aberto_em: ticket.criado_em ?? null,
      },
      cliente_id: ticket.cliente_id ?? null,
      cliente: clienteDoPrompt,
      atendente_id: ticket.colaborador_id ?? null,
      atendente: atendenteDoPrompt,
      modelo: provedor.modelo,
      versao: VERSAO_PROMPT_STATUS_ATENDIMENTO,
    }
    const assinaturaConteudo = assinarConteudoAnalisado({
      prompt: PROMPT_STATUS_ATENDIMENTO,
      entrada: entradaDaAnalise,
      transcricao,
      metadados: metadadosPrompt,
    })
    const salva = await lerAnaliseSalva(db, ticket.id)

    if (
      salva
      && !forcar
      && analiseContinuaValida(
        salva,
        assinatura,
        assinaturaConteudo,
        VERSAO_PROMPT_STATUS_ATENDIMENTO,
      )
    ) {
      const resposta = {
        markdown: salva.markdown,
        gerado_em: salva.gerado_em,
        modelo: salva.modelo ?? null,
        do_cache: true,
        total_mensagens: salva.total_mensagens,
        ultima_mensagem_em: salva.ultima_mensagem_em,
        metricas,
      }

      // Do cache não há o que escalonar: manda tudo de uma vez, no mesmo
      // protocolo, para o painel não precisar de dois caminhos de leitura.
      return emStream
        ? respostaSseImediata([
          ['meta', { metricas, do_cache: true, total_mensagens: salva.total_mensagens }],
          ['delta', { t: salva.markdown }],
          ['fim', resposta],
        ])
        : NextResponse.json(resposta)
    }

    const reserva = await reservarGeracaoStatusAtendimento(db, ticket.id)
    if (!reserva.ok) {
      console.error('[StatusAtendimento] não foi possível reservar a geração:', reserva.erro)
      return falha('Não foi possível reservar uma análise segura. Tente novamente em instantes.', 503)
    }
    if (!reserva.permitida) {
      const unidade = reserva.retryAfterSeconds === 1 ? 'segundo' : 'segundos'
      return falha(
        `Uma análise deste ticket já foi iniciada. Aguarde ${reserva.retryAfterSeconds} ${unidade} para reanalisar.`,
        429,
        {
          code: 'ANALISE_GERACAO_LIMITADA',
          retry_after_seconds: reserva.retryAfterSeconds,
          retry_after_at: reserva.proximaGeracaoEm,
        },
        { 'Retry-After': String(reserva.retryAfterSeconds) },
      )
    }

    const corpoDaChamada = {
      model: provedor.modelo,
      messages: [
        { role: 'system', content: PROMPT_STATUS_ATENDIMENTO },
        {
          role: 'user',
          content: entradaDaAnalise,
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
      // Sempre explícito: o gateway da Softcom responde em text/event-stream
      // quando o campo vem ausente, o que estouraria a leitura em JSON do
      // caminho não-streaming. A OpenAI não faz streaming por omissão.
      stream: emStream,
    }

    /** Fecha a análise: grava no cache e devolve o payload completo. */
    const concluir = async (markdown: string) => {
      const geradoEm = new Date().toISOString()
      await salvarAnalise(db, {
        ticket_id: ticket.id,
        markdown,
        ultima_mensagem_id: assinatura.ultimaMensagemId,
        ultima_mensagem_em: assinatura.ultimaMensagemEm,
        total_mensagens: assinatura.totalMensagens,
        modelo: provedor.modelo,
        gerado_em: geradoEm,
        assinatura_conteudo: assinaturaConteudo,
        metadados_prompt: metadadosPrompt,
        versao_prompt: VERSAO_PROMPT_STATUS_ATENDIMENTO,
      })
      return {
        markdown,
        gerado_em: geradoEm,
        modelo: provedor.modelo,
        do_cache: false,
        total_mensagens: assinatura.totalMensagens,
        ultima_mensagem_em: assinatura.ultimaMensagemEm,
        metricas,
      }
    }

    const erroDeChave = (status: number) => `A IA respondeu ${status}. Confira a chave `
      + (provedor.origem === 'combo' ? 'do combo (ANALISE_IA_API_KEY).' : 'do setor.')

    if (emStream) {
      const respostaIa = await fetch(provedor.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provedor.apiKey}` },
        body: JSON.stringify(corpoDaChamada),
        signal: AbortSignal.timeout(TIMEOUT_IA_MS),
      }).catch((erro: unknown) => {
        console.error('[StatusAtendimento] falha ao abrir o stream:', erro)
        return null
      })

      if (!respostaIa?.ok || !respostaIa.body) {
        const status = respostaIa?.status ?? 0
        if (respostaIa) console.error('[StatusAtendimento] stream recusado:', status)
        return respostaSseImediata([['erro', {
          error: status ? erroDeChave(status) : 'Não foi possível falar com a IA.',
        }]])
      }

      const leitor = respostaIa.body.getReader()
      const decodificador = new TextDecoder()
      let acumulado = ''
      let restante = ''

      const stream = new ReadableStream({
        async start(controlador) {
          const enviar = (evento: string, dados: unknown) => {
            controlador.enqueue(new TextEncoder().encode(sse(evento, dados)))
          }

          // As métricas saem primeiro: são cálculo local e não precisam esperar
          // a IA. O painel já desenha os números enquanto o texto chega.
          enviar('meta', { metricas, do_cache: false, total_mensagens: assinatura.totalMensagens })

          try {
            for (;;) {
              const { done, value } = await leitor.read()
              if (done) break

              const pedaco = extrairDeltasSse(decodificador.decode(value, { stream: true }), restante)
              restante = pedaco.restante
              for (const texto of pedaco.textos) {
                acumulado += texto
                enviar('delta', { t: texto })
              }
              if (pedaco.terminou) break
            }

            const markdown = acumulado.trim()
            if (!markdown) {
              enviar('erro', { error: 'A IA devolveu uma resposta vazia.' })
            } else {
              enviar('fim', await concluir(markdown))
            }
          } catch (erroStream: unknown) {
            const detalhe = erroStream instanceof Error ? erroStream.message : 'erro desconhecido'
            console.error('[StatusAtendimento] stream interrompido:', detalhe)
            // Já pode ter saído texto na tela; o painel decide se mantém o
            // parcial ou mostra o erro.
            enviar('erro', { error: 'A conexão com a IA caiu no meio da análise.' })
          } finally {
            await leitor.cancel().catch(() => {})
            controlador.close()
          }
        },
      })

      return new Response(stream, { headers: CABECALHOS_SSE })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_IA_MS)

    let markdown: string
    try {
      const resposta = await fetch(provedor.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provedor.apiKey}` },
        body: JSON.stringify(corpoDaChamada),
        signal: controller.signal,
      })

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => '')
        console.error('[StatusAtendimento] provedor de IA respondeu', resposta.status, detalhe.slice(0, 500))
        return NextResponse.json({ error: erroDeChave(resposta.status) }, { status: 502 })
      }

      const dados = await resposta.json()
      markdown = dados?.choices?.[0]?.message?.content?.trim() || ''
    } catch (erroIa: unknown) {
      if (erroIa instanceof Error && erroIa.name === 'AbortError') {
        return NextResponse.json(
          { error: 'A IA não respondeu a tempo. Tente de novo em instantes.' },
          { status: 504 },
        )
      }
      const mensagem = erroIa instanceof Error ? erroIa.message : 'erro desconhecido'
      console.error('[StatusAtendimento] falha ao chamar a IA:', mensagem)
      return NextResponse.json({ error: 'Não foi possível falar com a IA.' }, { status: 502 })
    } finally {
      clearTimeout(timeout)
    }

    if (!markdown) {
      return NextResponse.json({ error: 'A IA devolveu uma resposta vazia.' }, { status: 502 })
    }

    return NextResponse.json(await concluir(markdown))
  } catch (erro: unknown) {
    console.error('[StatusAtendimento] erro inesperado:', erro)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * A mesma conversa que o supervisor lê no diálogo do Monitoramento: mensagens
 * do ticket mais o histórico do Nexus anterior à abertura. Sem esse histórico,
 * ticket aberto pelo bot chegaria à IA sem o pedido original do cliente — é lá
 * que o problema costuma estar descrito.
 */
async function carregarConversa(
  db: ReturnType<typeof createServiceClient>,
  ticket: { id: string; cliente_id: string | null; criado_em: string | null },
  telefone: string | null,
): Promise<MensagemParaAnalise[]> {
  const colunas = 'id, ticket_id, remetente, conteudo, tipo, media_type, enviado_em'

  // Decrescente + reverso: pedir crescente com limite devolveria o começo da
  // conversa, e a análise falaria de um problema já resolvido.
  const { data: doTicket, error: erroTicket } = await db
    .from('mensagens')
    .select(colunas)
    .eq('ticket_id', ticket.id)
    .order('enviado_em', { ascending: false })
    .range(0, LIMITE_MENSAGENS_ANALISE - 1)

  if (erroTicket) {
    console.error('[StatusAtendimento] erro ao buscar mensagens:', erroTicket.message)
    return []
  }

  const mensagens: MensagemDoBanco[] = [...((doTicket as MensagemDoBanco[]) ?? [])].reverse()

  // O mesmo telefone pode ter mais de um cadastro de cliente; sem juntar todos,
  // o histórico do Nexus some justamente nos duplicados.
  let clienteIds = ticket.cliente_id ? [ticket.cliente_id] : []
  if (telefone) {
    const { data: duplicados, error: erroDuplicados } = await db
      .from('clientes')
      .select('id')
      .eq('telefone', telefone)
      .limit(50)

    if (erroDuplicados) {
      console.warn('[StatusAtendimento] erro ao buscar clientes do telefone:', erroDuplicados.message)
    } else if (duplicados?.length) {
      clienteIds = [...new Set([...clienteIds, ...duplicados.map((c: { id: string }) => c.id)])]
    }
  }

  if (clienteIds.length > 0 && ticket.criado_em) {
    const { data: orfas, error: erroOrfas } = await db
      .from('mensagens')
      .select(colunas)
      .in('cliente_id', clienteIds)
      .is('ticket_id', null)
      .in('remetente', ['cliente-nexus', 'bot-nexus'])
      .gte('enviado_em', calcularInicioJanelaHistoricoIso(ticket.criado_em))
      .order('enviado_em', { ascending: false })
      .range(0, LIMITE_MENSAGENS_ANALISE - 1)

    if (erroOrfas) {
      console.warn('[StatusAtendimento] erro ao buscar histórico do Nexus:', erroOrfas.message)
    } else if (orfas?.length) {
      const candidatas = (orfas as MensagemDoBanco[]).map((m) => ({
        ...m,
        remetente: m.remetente ?? '',
        enviado_em: m.enviado_em ?? '',
      }))
      const idsContexto = selecionarIdsContextoNexusOrfao(candidatas, ticket.criado_em)
      mensagens.push(...(orfas as MensagemDoBanco[]).filter((m) => idsContexto.has(m.id)))
    }
  }

  const vistos = new Set<string>()
  const unicas = mensagens.filter((m) => {
    if (vistos.has(m.id)) return false
    vistos.add(m.id)
    return true
  })

  return unicas.sort(
    (a, b) => new Date(a.enviado_em ?? 0).getTime() - new Date(b.enviado_em ?? 0).getTime(),
  )
}
