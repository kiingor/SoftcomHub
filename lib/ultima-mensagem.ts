// Quanto tempo faz que alguém falou nesta conversa, e quem falou.
//
// O painel de informações mostrava só "com atendente atual" e "no setor atual",
// que contam desde a atribuição e não param nunca. Nenhum dos dois responde a
// pergunta que o gestor faz ao abrir o painel: esta conversa está andando ou
// parada? Um ticket de 2h com resposta há 1min está saudável; o mesmo ticket
// com a última fala há 40min não está.
//
// Por isso a saída traz o remetente junto do tempo: "há 40min" sozinho não
// distingue o cliente esperando resposta do atendente esperando o cliente.

// Sem imports de propósito: o runner de teste do Node exige a extensão `.ts` no
// caminho relativo e o `tsc` a proíbe, então importar `lib/utils` aqui quebraria
// um dos dois. A classificação abaixo repete a regra de `isClientMessage` e
// `isBotMessage` — e `tests/ultima-mensagem.test.mjs` importa as duas versões e
// falha se elas divergirem, que é o que impede `cliente-nexus` de ser esquecido
// de novo em um dos lados.

export type QuemFalouPorUltimo = 'cliente' | 'atendente' | 'bot' | 'sistema'

export type UltimaMensagem = {
  enviadoEm: string
  quem: QuemFalouPorUltimo
}

type MensagemParaResumo = {
  remetente?: string | null
  enviado_em?: string | null
}

function classificarRemetente(remetente: string | null | undefined): QuemFalouPorUltimo {
  const normalizado = (remetente || '').toLowerCase().trim()
  if (normalizado.startsWith('cliente')) return 'cliente'
  if (normalizado === 'bot' || normalizado === 'bot-nexus') return 'bot'
  if (normalizado === 'sistema') return 'sistema'
  return 'atendente'
}

/**
 * A mensagem mais recente da conversa.
 *
 * Não assume ordenação: percorre tudo e fica com o maior `enviado_em`. As telas
 * carregam a conversa em ordem crescente, mas o histórico do Nexus é costurado
 * junto e já apareceu fora de ordem — confiar no último item do array daria o
 * tempo errado sem nenhum sinal de erro.
 *
 * Mensagem sem `enviado_em` é ignorada: não dá para medir tempo sem instante, e
 * chutar `agora` mostraria "há 0min" numa conversa parada — o oposto do que o
 * painel existe para denunciar.
 */
export function resolverUltimaMensagem(
  mensagens: readonly MensagemParaResumo[] | null | undefined,
): UltimaMensagem | null {
  let melhor: UltimaMensagem | null = null
  let melhorInstante = Number.NEGATIVE_INFINITY

  for (const mensagem of mensagens || []) {
    const enviadoEm = mensagem?.enviado_em
    if (!enviadoEm) continue
    const instante = new Date(enviadoEm).getTime()
    if (!Number.isFinite(instante)) continue
    if (instante <= melhorInstante) continue

    melhorInstante = instante
    melhor = { enviadoEm, quem: classificarRemetente(mensagem.remetente) }
  }

  return melhor
}

const ROTULO_DE_QUEM: Record<QuemFalouPorUltimo, string> = {
  cliente: 'do cliente',
  atendente: 'do atendente',
  bot: 'do Nexus',
  sistema: 'do sistema',
}

/** "do cliente", "do atendente"… para compor "última mensagem <rótulo>". */
export function rotuloDeQuemFalou(quem: QuemFalouPorUltimo): string {
  return ROTULO_DE_QUEM[quem]
}
