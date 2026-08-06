import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
      resolvedPath = `${resolvedPath}.ts`
    }
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const {
  analiseContinuaValida,
  assinarConversa,
  calcularMetricasDeTempo,
  extrairDeltasSse,
  formatarDuracao,
  montarEntradaDaAnalise,
  montarTranscricao,
  normalizarMotivoAberturaNexus,
  papelDoRemetente,
  PROMPT_STATUS_ATENDIMENTO,
} = await import('../lib/analise-atendimento.ts')

const ONTEM = '2026-08-06T13:05:00.000Z' // 10:05 em São Paulo

function mensagem(campos) {
  return { id: 'm1', remetente: 'cliente', conteudo: 'oi', tipo: 'texto', enviado_em: ONTEM, ...campos }
}

test('o Nexus entra na transcrição como o próprio cliente e o próprio bot', () => {
  assert.equal(papelDoRemetente('cliente'), 'Cliente')
  assert.equal(papelDoRemetente('cliente-nexus'), 'Cliente')
  assert.equal(papelDoRemetente('bot'), 'Bot')
  assert.equal(papelDoRemetente('bot-nexus'), 'Bot')
  assert.equal(papelDoRemetente('colaborador'), 'Atendente')
  assert.equal(papelDoRemetente('supervisor'), 'Supervisor (nota interna)')
  assert.equal(papelDoRemetente('sistema'), 'Sistema')
  assert.equal(papelDoRemetente(null), 'Atendente')
})

test('a transcrição sai em uma linha por mensagem, com horário de São Paulo', () => {
  const transcricao = montarTranscricao([
    mensagem({ id: 'a', conteudo: 'meu pdv não abre' }),
    mensagem({ id: 'b', remetente: 'colaborador', conteudo: 'já vou verificar' }),
  ])

  assert.equal(
    transcricao,
    '[06/08, 10:05] Cliente: meu pdv não abre\n[06/08, 10:05] Atendente: já vou verificar',
  )
})

test('blob de protocolo do WhatsApp não vira fala do cliente', () => {
  const transcricao = montarTranscricao([
    mensagem({ id: 'a', conteudo: '{"messageContextInfo":{"deviceListMetadata":{}}}' }),
    mensagem({ id: 'b', conteudo: 'está travando' }),
  ])

  assert.equal(transcricao, '[06/08, 10:05] Cliente: está travando')
})

test('botão, reação e anexo aparecem descritos em vez de sumirem', () => {
  const transcricao = montarTranscricao([
    mensagem({ id: 'a', conteudo: '{"text":"Suporte","payload":"1"}' }),
    mensagem({ id: 'b', conteudo: '{"emoji":"👍"}' }),
    mensagem({ id: 'c', conteudo: '', tipo: 'audio', media_type: 'audio/ogg' }),
    mensagem({ id: 'd', conteudo: 'olha o print', tipo: 'imagem', media_type: 'image/png' }),
  ])

  assert.deepEqual(transcricao.split('\n'), [
    '[06/08, 10:05] Cliente: (apertou o botão "Suporte")',
    '[06/08, 10:05] Cliente: (reagiu com 👍)',
    '[06/08, 10:05] Cliente: [áudio]',
    '[06/08, 10:05] Cliente: [imagem] olha o print',
  ])
})

test('mensagem sem texto e sem anexo fica de fora', () => {
  assert.equal(montarTranscricao([mensagem({ conteudo: '   ' })]), '')
  assert.equal(montarTranscricao([]), '')
})

test('a assinatura da conversa é a última mensagem mais o total', () => {
  const assinatura = assinarConversa([
    mensagem({ id: 'a' }),
    mensagem({ id: 'b', enviado_em: '2026-08-06T14:00:00.000Z' }),
  ])

  assert.deepEqual(assinatura, {
    ultimaMensagemId: 'b',
    ultimaMensagemEm: '2026-08-06T14:00:00.000Z',
    totalMensagens: 2,
  })
})

test('conversa vazia assina em branco', () => {
  assert.deepEqual(assinarConversa([]), {
    ultimaMensagemId: null,
    ultimaMensagemEm: null,
    totalMensagens: 0,
  })
})

test('sem mensagem nova a análise salva continua valendo', () => {
  const salva = {
    markdown: '## Resumo\nPDV travando.',
    ultima_mensagem_id: 'b',
    ultima_mensagem_em: ONTEM,
    total_mensagens: 2,
    gerado_em: ONTEM,
  }

  assert.equal(
    analiseContinuaValida(salva, { ultimaMensagemId: 'b', ultimaMensagemEm: ONTEM, totalMensagens: 2 }),
    true,
  )
})

test('mensagem nova invalida a análise', () => {
  const salva = {
    markdown: '## Resumo\nPDV travando.',
    ultima_mensagem_id: 'b',
    ultima_mensagem_em: ONTEM,
    total_mensagens: 2,
    gerado_em: ONTEM,
  }

  assert.equal(
    analiseContinuaValida(salva, { ultimaMensagemId: 'c', ultimaMensagemEm: ONTEM, totalMensagens: 3 }),
    false,
  )
})

test('mensagem apagada também invalida, mesmo com a última mantida', () => {
  const salva = {
    markdown: '## Resumo\nPDV travando.',
    ultima_mensagem_id: 'b',
    ultima_mensagem_em: ONTEM,
    total_mensagens: 5,
    gerado_em: ONTEM,
  }

  assert.equal(
    analiseContinuaValida(salva, { ultimaMensagemId: 'b', ultimaMensagemEm: ONTEM, totalMensagens: 4 }),
    false,
  )
})

test('motivo da abertura pelo Nexus também faz parte da validade do cache', () => {
  const salva = {
    markdown: '## Resumo\nPDV travando.',
    ultima_mensagem_id: 'b',
    ultima_mensagem_em: ONTEM,
    total_mensagens: 2,
    gerado_em: ONTEM,
    motivo_abertura_nexus: 'Cliente relatou falha no PDV.',
  }
  const assinatura = { ultimaMensagemId: 'b', ultimaMensagemEm: ONTEM, totalMensagens: 2 }

  assert.equal(
    analiseContinuaValida(salva, assinatura, 'Cliente relatou falha no PDV.'),
    true,
  )
  assert.equal(
    analiseContinuaValida(salva, assinatura, 'Cliente pediu segunda via de boleto.'),
    false,
  )
})

test('cache sem markdown, sem id ou de conversa vazia é sempre refeito', () => {
  const base = { ultima_mensagem_id: 'b', ultima_mensagem_em: ONTEM, total_mensagens: 2, gerado_em: ONTEM }
  const assinatura = { ultimaMensagemId: 'b', ultimaMensagemEm: ONTEM, totalMensagens: 2 }

  assert.equal(analiseContinuaValida(null, assinatura), false)
  assert.equal(analiseContinuaValida({ ...base, markdown: '' }, assinatura), false)
  assert.equal(analiseContinuaValida({ ...base, markdown: '##', ultima_mensagem_id: null }, assinatura), false)
  assert.equal(
    analiseContinuaValida(
      { ...base, markdown: '##', ultima_mensagem_id: null, total_mensagens: 0 },
      { ultimaMensagemId: null, ultimaMensagemEm: null, totalMensagens: 0 },
    ),
    false,
  )
})

// --- leitura do SSE do provedor ---

const linha = (texto) => `data: ${JSON.stringify({ choices: [{ delta: { content: texto } }] })}\n`

test('extrai o texto dos deltas e reconhece o fim do stream', () => {
  const r = extrairDeltasSse(`${linha('## Res')}${linha('umo\n')}data: [DONE]\n`)

  assert.deepEqual(r.textos, ['## Res', 'umo\n'])
  assert.equal(r.terminou, true)
  assert.equal(r.restante, '')
})

test('linha cortada no meio do chunk é retomada na próxima', () => {
  // O provedor manda "## Resumo" partido entre dois pacotes da rede.
  const inteira = linha('## Resumo')
  const corte = Math.floor(inteira.length / 2)

  const primeiro = extrairDeltasSse(inteira.slice(0, corte))
  assert.deepEqual(primeiro.textos, [])
  assert.notEqual(primeiro.restante, '')

  const segundo = extrairDeltasSse(inteira.slice(corte), primeiro.restante)
  assert.deepEqual(segundo.textos, ['## Resumo'])
  assert.equal(segundo.restante, '')
})

test('keep-alive e lixo não-JSON não derrubam a leitura', () => {
  const r = extrairDeltasSse(`: ping\n\ndata: {quebrado\n${linha('ok')}`)

  assert.deepEqual(r.textos, ['ok'])
  assert.equal(r.terminou, false)
})

test('aceita também a forma não-streaming (message.content)', () => {
  const r = extrairDeltasSse(`data: ${JSON.stringify({ choices: [{ message: { content: 'texto' } }] })}\n`)

  assert.deepEqual(r.textos, ['texto'])
})

// --- métricas de tempo: calculadas em código, nunca pela IA ---

/** Conversa em minutos a partir da abertura, para o teste ficar legível. */
function conversa(...falas) {
  const base = Date.parse('2026-08-06T12:00:00.000Z')
  return falas.map(([remetente, minuto], i) => ({
    id: `m${i}`,
    remetente,
    conteudo: 'x',
    tipo: 'texto',
    enviado_em: new Date(base + minuto * 60_000).toISOString(),
  }))
}

test('o bot NÃO conta como atendente na primeira resposta', () => {
  // O bot responde em 1min, o humano só aos 20. O FRT tem que ser 20min.
  const m = calcularMetricasDeTempo(conversa(
    ['cliente', 0], ['bot', 1], ['colaborador', 20],
  ))

  assert.equal(m.primeiraRespostaMs, 20 * 60_000)
})

test('mede FRT, médias e maior espera sobre pares de lados diferentes', () => {
  const m = calcularMetricasDeTempo(conversa(
    ['cliente', 0],
    ['colaborador', 2],   // atendente: 2min  (FRT)
    ['cliente', 5],       // cliente: 3min
    ['colaborador', 9],   // atendente: 4min
  ))

  assert.equal(m.primeiraRespostaMs, 2 * 60_000)
  assert.equal(m.mediaAtendenteMs, 3 * 60_000)
  assert.equal(m.mediaClienteMs, 3 * 60_000)
  assert.deepEqual(m.maiorLacuna, { ms: 4 * 60_000, quemEsperou: 'cliente' })
  assert.equal(m.respostasDoAtendente, 2)
})

test('mensagens seguidas do mesmo lado não viram espera de ninguém', () => {
  // Três falas do cliente em sequência: nenhum intervalo conta.
  const m = calcularMetricasDeTempo(conversa(
    ['cliente', 0], ['cliente', 30], ['cliente', 60], ['colaborador', 61],
  ))

  assert.equal(m.primeiraRespostaMs, 1 * 60_000)
  assert.equal(m.respostasDoAtendente, 1)
  assert.equal(m.outliers, 0)
  assert.deepEqual(m.maiorLacuna, { ms: 60_000, quemEsperou: 'cliente' })
})

test('conta outliers acima de 10min e respostas acima da própria média', () => {
  const m = calcularMetricasDeTempo(conversa(
    ['cliente', 0], ['colaborador', 1],
    ['cliente', 2], ['colaborador', 14],  // 12min → outlier
  ))

  assert.equal(m.outliers, 1)
  assert.equal(m.respostasDoAtendente, 2)
  assert.equal(m.respostasAcimaDaMedia, 1)
})

test('nota interna e sistema ficam fora da conta', () => {
  const m = calcularMetricasDeTempo(conversa(
    ['cliente', 0], ['supervisor', 1], ['sistema', 2], ['colaborador', 10],
  ))

  assert.equal(m.primeiraRespostaMs, 10 * 60_000)
  assert.equal(m.respostasDoAtendente, 1)
})

test('conversa sem troca de lado não produz métrica nenhuma', () => {
  const m = calcularMetricasDeTempo(conversa(['cliente', 0], ['cliente', 5]))

  assert.equal(m.primeiraRespostaMs, null)
  assert.equal(m.mediaAtendenteMs, null)
  assert.equal(m.maiorLacuna, null)
  assert.deepEqual(calcularMetricasDeTempo([]).maiorLacuna, null)
})

test('duração sai legível em segundos, minutos e horas', () => {
  assert.equal(formatarDuracao(null), '—')
  assert.equal(formatarDuracao(-1), '—')
  assert.equal(formatarDuracao(45_000), '45s')
  assert.equal(formatarDuracao(90_000), '1min')
  assert.equal(formatarDuracao(59 * 60_000), '59min')
  assert.equal(formatarDuracao(60 * 60_000), '1h')
  assert.equal(formatarDuracao(125 * 60_000), '2h 5min')
})

test('o prompt proíbe a IA de calcular tempo — quem mede é o código', () => {
  assert.match(PROMPT_STATUS_ATENDIMENTO, /NÃO calcule tempos/)
  assert.match(PROMPT_STATUS_ATENDIMENTO, /Motivo da abertura pelo Nexus/)
  for (const secao of ['## Status do diálogo', '## Ajuda e escalonamento', '## Pendências']) {
    assert.ok(PROMPT_STATUS_ATENDIMENTO.includes(secao), `faltou a seção ${secao}`)
  }
})

test('a entrada da IA carrega o cabeçalho do ticket antes da conversa', () => {
  const entrada = montarEntradaDaAnalise({
    numero: 156990,
    cliente: 'Padaria do Zé',
    atendente: null,
    status: 'aberto',
    abertoEm: ONTEM,
    motivoAberturaNexus: 'Cliente relatou que o PDV não imprime cupom.',
    transcricao: '[06/08, 10:05] Cliente: bom dia',
  })

  assert.match(entrada, /^Ticket: #156990\n/)
  assert.match(entrada, /Cliente: Padaria do Zé/)
  assert.match(entrada, /Atendente: sem atendente atribuído/)
  assert.match(entrada, /Aberto em: 06\/08, 10:05/)
  assert.match(entrada, /Motivo da abertura pelo Nexus: Cliente relatou que o PDV não imprime cupom/)
  assert.match(entrada, /Conversa:\n\[06\/08, 10:05\] Cliente: bom dia$/)
})

test('motivo da abertura pelo Nexus vazio não entra no contexto', () => {
  assert.equal(normalizarMotivoAberturaNexus('  '), null)
  assert.equal(normalizarMotivoAberturaNexus(null), null)
  assert.equal(normalizarMotivoAberturaNexus(' Falha ao emitir nota '), 'Falha ao emitir nota')

  const entrada = montarEntradaDaAnalise({
    motivoAberturaNexus: ' ',
    transcricao: '[06/08, 10:05] Cliente: bom dia',
  })

  assert.equal(entrada.includes('Motivo da abertura pelo Nexus'), false)
})
