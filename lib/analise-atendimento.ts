/**
 * "Status do atendimento" — a leitura de IA da conversa de um ticket.
 *
 * O supervisor abre o mesmo ticket várias vezes enquanto acompanha a fila do
 * Monitoramento, e cada abertura custaria uma chamada de LLM sobre a conversa
 * inteira. Por isso a análise é reutilizada apenas enquanto a entrada enviada
 * ao modelo (conversa, prompt e contexto) não muda. É o mesmo raciocínio do
 * resumo por ticket do painel Mapa do Maroto, só que sobre as mensagens do
 * próprio Hub — os tickets do ticket-x-api são de outro sistema e não
 * compartilham numeração com os daqui.
 *
 * Aqui ficam só as partes puras (transcrição, assinatura da conversa e o
 * prompt). A chamada da IA e o cache moram em `app/api/ia/status-atendimento`.
 */

import { interpretarConteudo } from '@/lib/mensagem-conteudo'

const FUSO = 'America/Sao_Paulo'

/**
 * Teto de mensagens que entram na transcrição.
 *
 * Vale para o custo do prompt e para o teto silencioso do PostgREST: a consulta
 * TEM que pedir as mais RECENTES (ordem decrescente + limite) e reverter depois.
 * Pedir crescente com limite devolveria o começo da conversa e a análise falaria
 * de um problema já resolvido.
 */
export const LIMITE_MENSAGENS_ANALISE = 200

/** Incrementar quando as instruções ou o formato da análise mudarem. */
export const VERSAO_PROMPT_STATUS_ATENDIMENTO = '2026-08-06.3'

export interface MensagemParaAnalise {
  id: string
  remetente?: string | null
  conteudo?: string | null
  tipo?: string | null
  media_type?: string | null
  enviado_em?: string | null
}

/**
 * O que identifica o estado da conversa no momento em que a análise foi feita.
 *
 * `ultimaMensagemId` sozinho já pega mensagem nova; o total entra para que
 * exclusão de mensagem também invalide o cache.
 */
export interface AssinaturaDaConversa {
  ultimaMensagemId: string | null
  ultimaMensagemEm: string | null
  totalMensagens: number
}

/** A linha guardada em `ticket_analises_ia`, no formato que vem do banco. */
export interface AnaliseSalva {
  markdown: string
  ultima_mensagem_id: string | null
  ultima_mensagem_em: string | null
  total_mensagens: number
  gerado_em: string
  modelo?: string | null
  assinatura_conteudo?: string | null
  versao_prompt?: string | null
}

export function normalizarMotivoAberturaNexus(valor: unknown): string | null {
  if (typeof valor !== 'string') return null

  const motivo = valor.trim()
  return motivo || null
}

/**
 * Como cada remetente aparece na transcrição.
 *
 * `cliente-nexus`/`bot-nexus` são a mesma conversa vista pelo bot do Nexus —
 * viram Cliente e Bot, senão o modelo trata o histórico pré-ticket como se
 * fosse outra pessoa falando.
 */
export function papelDoRemetente(remetente?: string | null): string {
  const valor = (remetente || '').toLowerCase().trim()
  if (valor.startsWith('cliente')) return 'Cliente'
  if (valor === 'bot' || valor === 'bot-nexus') return 'Bot'
  if (valor === 'supervisor') return 'Supervisor (nota interna)'
  if (valor === 'sistema') return 'Sistema'
  return 'Atendente'
}

/** Rótulo do anexo quando a mensagem não é texto. `null` para texto puro. */
function rotuloDeMidia(tipo?: string | null, mediaType?: string | null): string | null {
  const t = (tipo || '').toLowerCase()
  const m = (mediaType || '').toLowerCase()

  if (m.startsWith('audio') || t.includes('audio') || t.includes('áudio')) return '[áudio]'
  if (m.startsWith('image') || t.includes('imagem') || t.includes('image')) return '[imagem]'
  if (m.startsWith('video') || t.includes('video') || t.includes('vídeo')) return '[vídeo]'
  if (m.startsWith('application') || t.includes('documento') || t.includes('document')) return '[documento]'
  if (t && t !== 'texto') return `[${t}]`
  return null
}

function horario(enviadoEm?: string | null): string {
  if (!enviadoEm) return '--:--'
  const data = new Date(enviadoEm)
  if (Number.isNaN(data.getTime())) return '--:--'
  return data.toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Uma linha por mensagem, em ordem cronológica.
 *
 * O conteúdo passa por `interpretarConteudo` pelo mesmo motivo do chat: blob de
 * protocolo do WhatsApp chega no campo de texto e seria lido pelo modelo como
 * se o cliente tivesse escrito JSON. Mensagem que sobra sem texto nenhum sai da
 * transcrição — exceto quando tem anexo, aí vale registrar que algo foi enviado.
 */
export function montarTranscricao(mensagens: MensagemParaAnalise[]): string {
  const linhas: string[] = []

  for (const mensagem of mensagens) {
    const interpretado = interpretarConteudo(mensagem.conteudo)
    const midia = rotuloDeMidia(mensagem.tipo, mensagem.media_type)

    let texto = ''
    if (interpretado.tipo === 'texto') texto = interpretado.texto.trim()
    else if (interpretado.tipo === 'botao') texto = `(apertou o botão "${interpretado.texto}")`
    else if (interpretado.tipo === 'reacao') texto = `(reagiu com ${interpretado.emoji})`

    const corpo = [midia, texto].filter(Boolean).join(' ').trim()
    if (!corpo) continue

    linhas.push(`[${horario(mensagem.enviado_em)}] ${papelDoRemetente(mensagem.remetente)}: ${corpo}`)
  }

  return linhas.join('\n')
}

/**
 * Extrai os pedaços de texto de um bloco SSE do provedor.
 *
 * O corpo chega em `data: {json}` por linha, com `data: [DONE]` no fim. Um
 * chunk da rede pode cortar no meio de uma linha, então quem chama guarda o
 * resto e devolve na próxima — daí a função receber e devolver o `restante`.
 *
 * Isolado aqui porque é a parte que erra calado: sem tratar o corte, some texto
 * do meio da análise e ninguém percebe.
 */
export function extrairDeltasSse(
  pedaco: string,
  restante = '',
): { textos: string[]; restante: string; terminou: boolean } {
  const buffer = restante + pedaco
  const linhas = buffer.split('\n')
  // A última linha pode estar incompleta; só processa se o chunk terminou nela.
  const sobra = buffer.endsWith('\n') ? '' : (linhas.pop() ?? '')

  const textos: string[] = []
  let terminou = false

  for (const linha of linhas) {
    const conteudo = linha.trim()
    if (!conteudo.startsWith('data:')) continue

    const payload = conteudo.slice(5).trim()
    if (payload === '[DONE]') {
      terminou = true
      continue
    }

    try {
      const evento = JSON.parse(payload)
      const texto = evento?.choices?.[0]?.delta?.content
        ?? evento?.choices?.[0]?.message?.content
      if (typeof texto === 'string' && texto) textos.push(texto)
    } catch {
      // Linha que não é JSON (comentário `:` de keep-alive, por exemplo).
    }
  }

  return { textos, restante: sobra, terminou }
}

/** Limite acima do qual um intervalo entre falas vira outlier. */
export const LIMITE_OUTLIER_MS = 10 * 60_000

export interface MetricasDeTempo {
  /** FRT: da última fala do bloco consecutivo do cliente até a 1ª resposta HUMANA. */
  primeiraRespostaMs: number | null
  /** Média dos intervalos cliente → atendente. */
  mediaAtendenteMs: number | null
  /** Média dos intervalos atendente → cliente. */
  mediaClienteMs: number | null
  maiorLacuna: { ms: number; quemEsperou: 'cliente' | 'atendente' } | null
  /** Intervalos acima de `LIMITE_OUTLIER_MS`. */
  outliers: number
  respostasDoAtendente: number
  /** Respostas do atendente acima da própria média. */
  respostasAcimaDaMedia: number
}

type Lado = 'cliente' | 'atendente'

/**
 * De que lado a mensagem conta para as métricas.
 *
 * BOT NÃO É ATENDENTE. Contar a resposta automática do Nexus como atendimento
 * zeraria o FRT de toda conversa que passa pelo bot — que é a maioria — e
 * esconderia exatamente o que o supervisor quer ver. É o mesmo erro que já
 * inflou a métrica de fila: ver a nota no topo de `lib/relatorio-fila.ts`.
 * Nota interna do supervisor e mensagem de sistema também ficam de fora: não
 * são fala do atendimento.
 */
function ladoDaMensagem(remetente?: string | null): Lado | null {
  const papel = papelDoRemetente(remetente)
  if (papel === 'Cliente') return 'cliente'
  if (papel === 'Atendente') return 'atendente'
  return null
}

function paraMs(valor?: string | null): number | null {
  if (!valor) return null
  const ms = new Date(valor).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Os números que a IA não precisa (e não deveria) calcular.
 *
 * O prompt de referência pedia FRT, médias e outliers ao próprio modelo. LLM
 * erra aritmética e cada recálculo sai diferente, enquanto os carimbos já estão
 * todos aqui — em código o resultado é exato, instantâneo e de graça.
 *
 * Só conta par de lados DIFERENTES: em um bloco consecutivo do cliente, a
 * primeira resposta começa na última fala dele. As anteriores não são espera
 * separada de ninguém.
 */
export function calcularMetricasDeTempo(mensagens: MensagemParaAnalise[]): MetricasDeTempo {
  const falas = mensagens
    .map((m) => ({ lado: ladoDaMensagem(m.remetente), ms: paraMs(m.enviado_em) }))
    .filter((f): f is { lado: Lado; ms: number } => f.lado !== null && f.ms !== null)

  const intervalosAtendente: number[] = []
  const intervalosCliente: number[] = []
  let primeiraRespostaMs: number | null = null
  let maiorLacuna: MetricasDeTempo['maiorLacuna'] = null
  let outliers = 0

  for (let i = 1; i < falas.length; i += 1) {
    const anterior = falas[i - 1]
    const atual = falas[i]
    if (anterior.lado === atual.lado) continue

    const intervalo = atual.ms - anterior.ms
    if (intervalo < 0) continue

    if (atual.lado === 'atendente') {
      intervalosAtendente.push(intervalo)
      if (primeiraRespostaMs === null) primeiraRespostaMs = intervalo
    } else {
      intervalosCliente.push(intervalo)
    }

    if (intervalo > LIMITE_OUTLIER_MS) outliers += 1
    if (!maiorLacuna || intervalo > maiorLacuna.ms) {
      // Quem esperou é quem estava do outro lado do silêncio: se o atendente
      // respondeu, o cliente é que ficou aguardando.
      maiorLacuna = { ms: intervalo, quemEsperou: atual.lado === 'atendente' ? 'cliente' : 'atendente' }
    }
  }

  const media = (valores: number[]) => (
    valores.length === 0 ? null : Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
  )
  const mediaAtendenteMs = media(intervalosAtendente)

  return {
    primeiraRespostaMs,
    mediaAtendenteMs,
    mediaClienteMs: media(intervalosCliente),
    maiorLacuna,
    outliers,
    respostasDoAtendente: intervalosAtendente.length,
    respostasAcimaDaMedia: mediaAtendenteMs === null
      ? 0
      : intervalosAtendente.filter((intervalo) => intervalo > mediaAtendenteMs).length,
  }
}

/** hh:mm:ss não cabe num painel de 340px; "2h 5min" e "45s" cabem. */
export function formatarDuracao(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—'

  const segundos = Math.round(ms / 1000)
  if (segundos < 60) return `${segundos}s`

  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos}min`

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`
}

export function assinarConversa(mensagens: MensagemParaAnalise[]): AssinaturaDaConversa {
  const ultima = mensagens[mensagens.length - 1]
  return {
    ultimaMensagemId: ultima?.id ?? null,
    ultimaMensagemEm: ultima?.enviado_em ?? null,
    totalMensagens: mensagens.length,
  }
}

/**
 * A análise salva ainda descreve a conversa e o contexto de abertura atual?
 *
 * Só devolve `true` com mensagem identificada e assinatura completa dos dois
 * lados: cache legado, de conversa vazia ou sem a entrada efetivamente
 * analisada é sempre refeito.
 */
export function analiseContinuaValida(
  salva: AnaliseSalva | null | undefined,
  assinatura: AssinaturaDaConversa,
  assinaturaConteudo: string,
  versaoPrompt: string,
): boolean {
  if (!salva?.markdown) return false
  if (!salva.ultima_mensagem_id || !assinatura.ultimaMensagemId) return false
  if (!salva.assinatura_conteudo || !salva.versao_prompt) return false

  return salva.ultima_mensagem_id === assinatura.ultimaMensagemId
    && salva.total_mensagens === assinatura.totalMensagens
    && salva.assinatura_conteudo === assinaturaConteudo
    && salva.versao_prompt === versaoPrompt
}

/**
 * As seções que a tela espera receber, nesta ordem.
 *
 * O formato é o mesmo do resumo por ticket do Mapa do Maroto — `##` para
 * título, `-` para item, `**` para destaque —, que é tudo que o renderizador
 * do diálogo entende.
 */
export const PROMPT_STATUS_ATENDIMENTO = [
  'Você é o supervisor de uma equipe de atendimento por WhatsApp e está lendo a',
  'conversa de um atendimento em andamento para decidir se precisa intervir.',
  '',
  'Responda SOMENTE em markdown, em português do Brasil, exatamente com estas seções:',
  '',
  '## Resumo',
  'Uma ou duas frases sobre o que o cliente procurou.',
  '',
  '## Situação atual',
  '- Em que ponto o atendimento está agora.',
  '',
  '## Já resolvido',
  '- O que o atendente já entregou ou esclareceu. Escreva "- Nada ainda." se não houver.',
  '',
  '## Pendências',
  '- O que falta fazer, e de quem é a bola. Escreva "- Nenhuma." se não houver.',
  '',
  '## Status do diálogo',
  '- **Conclusivo**, **Em andamento** ou **Problemático** — e, na mesma linha, o porquê em uma frase.',
  '  Conclusivo: dúvida sanada ou orientação final clara, com encerramento.',
  '  Em andamento: há ação pendente, sem encerramento claro.',
  '  Problemático: instrução ambígua, promessa sem entrega, informação conflitante,',
  '  ou cliente sem resposta depois de insistir.',
  '',
  '## Ajuda e escalonamento',
  '- **Precisa de ajuda:** Sim ou Não — motivo curto.',
  '- **Pedir gestor:** Sim ou Não — motivo curto.',
  '',
  '## Pontos de atenção',
  // O rótulo e o porquê ficam no MESMO item. Escrito como duas instruções
  // ("seguido de uma linha justificando"), o gpt-5.4 devolveu a instrução
  // literal — "Linha justificando: há falha funcional..." — no lugar do texto.
  '- **Risco:** Baixo — e, na mesma linha, o porquê em poucas palavras. Use Baixo, Médio ou Alto.',
  '- Sinais de irritação, cobrança, repetição de pergunta ou silêncio longo do atendente.',
  '',
  'Regras:',
  '- Baseie-se apenas na conversa e no contexto do ticket. Não invente dado que não esteja lá.',
  '- Quando houver "Motivo da abertura pelo Nexus" no contexto do ticket, informe-o claramente no Resumo: ele é a razão declarada para o Nexus abrir o ticket.',
  '- Seja direto: no máximo 4 itens por seção, uma linha cada.',
  '- Não repita a transcrição nem cite horários item a item.',
  // Os tempos são calculados em código e mostrados ao lado do texto: pedir ao
  // modelo produziria número errado e concorrente com o certo.
  '- NÃO calcule tempos, médias nem contagens. A tela já mostra isso medido.',
  '- Não use blocos de código, tabelas, títulos com # nem ### — só ##, - e **.',
].join('\n')

/** O bloco de contexto que acompanha a transcrição na mensagem do usuário. */
export function montarEntradaDaAnalise(contexto: {
  numero?: number | string | null
  cliente?: string | null
  atendente?: string | null
  status?: string | null
  abertoEm?: string | null
  motivoAberturaNexus?: string | null
  transcricao: string
}): string {
  const motivoAberturaNexus = normalizarMotivoAberturaNexus(contexto.motivoAberturaNexus)
  const cabecalho = [
    `Ticket: #${contexto.numero ?? '—'}`,
    `Cliente: ${contexto.cliente || 'não informado'}`,
    `Atendente: ${contexto.atendente || 'sem atendente atribuído'}`,
    `Status: ${contexto.status || 'não informado'}`,
    `Aberto em: ${horario(contexto.abertoEm)}`,
    ...(motivoAberturaNexus
      ? ['Motivo da abertura pelo Nexus: ' + motivoAberturaNexus]
      : []),
  ].join('\n')

  return `${cabecalho}\n\nConversa:\n${contexto.transcricao}`
}
