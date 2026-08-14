import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decidirEncerramento,
  descreverOcExistente,
  exigirOcNoTicket,
  interpretarRespostaOc,
  ocIndeterminada,
  ocObrigatoriaLigada,
  ticketEhDisparo,
  MENSAGEM_SEM_OC,
  OC_FLAG_ENV,
} from '../lib/oc-ticket.ts'

/** Atalho: da resposta HTTP crua até "pode encerrar?", com a flag ligada. */
const encerrarComFlagLigada = (status, corpo, numero) =>
  decidirEncerramento(true, interpretarRespostaOc(status, corpo, numero))

/**
 * Resposta real de `GET /v1/tickets/numero/164494`, encurtada: o vínculo mora
 * no campo `ticket`, e `id` é a OC. Colhida em 13/08/2026 contra produção.
 */
const OC_REAL = JSON.stringify([{
  id: 10790936,
  clienteId: 54562,
  clienteNome: 'NEM BIKE CG - CAMPINA GRANDE',
  motivo: 'Cliente relatou erro na impressão',
  data: '2026-08-13T00:00:00.000Z',
  telefone: '8391995920',
  tipoAtendimento: 'CHAT',
  ticket: 164494,
  finalizado: false,
  status: 'aberto',
}])

test('a flag só liga com valor afirmativo explícito', () => {
  assert.equal(OC_FLAG_ENV, 'OC_OBRIGATORIA_PARA_ENCERRAR')

  for (const ligado of ['1', 'true', 'TRUE', ' sim ', 'on']) {
    assert.equal(ocObrigatoriaLigada(ligado), true, `esperava ligado: ${ligado}`)
  }

  for (const desligado of [undefined, null, '', '0', 'false', 'nao', 'talvez']) {
    assert.equal(ocObrigatoriaLigada(desligado), false, `esperava desligado: ${desligado}`)
  }
})

test('a exigência precisa dos três: flag global, opt-in do setor e não ser disparo', () => {
  const exige = { flagGlobal: true, setorExige: true, ehDisparo: false }

  assert.equal(exigirOcNoTicket(exige), true)
  assert.equal(exigirOcNoTicket({ ...exige, flagGlobal: false }), false, 'flag global desligada isenta')
  assert.equal(exigirOcNoTicket({ ...exige, setorExige: false }), false, 'setor que não optou isenta')
  assert.equal(exigirOcNoTicket({ ...exige, ehDisparo: true }), false, 'disparo isenta')
})

test('setor sem opt-in explícito não exige — inclusive quando a coluna nem existe', () => {
  // `null`/`undefined` cobrem "coluna ainda não migrada" e "ticket sem setor".
  for (const setorExige of [null, undefined, false]) {
    assert.equal(
      exigirOcNoTicket({ flagGlobal: true, setorExige, ehDisparo: false }),
      false,
      `setorExige: ${setorExige}`,
    )
  }
})

test('a global sozinha não trava nada — o setor precisa optar', () => {
  // Sem isso, ligar a env travaria os 35 setores de uma vez.
  const decisao = decidirEncerramento(
    exigirOcNoTicket({ flagGlobal: true, setorExige: null, ehDisparo: false }),
    interpretarRespostaOc(200, '[]', 164371),
  )

  assert.equal(decisao.permite, true)
  assert.equal(decisao.bloqueio, null)
})

test('disparo isenta mesmo com setor exigindo e sem OC nenhuma', () => {
  const decisao = decidirEncerramento(
    exigirOcNoTicket({ flagGlobal: true, setorExige: true, ehDisparo: true }),
    interpretarRespostaOc(200, '[]', 164371),
  )

  assert.equal(decisao.permite, true)
  assert.equal(decisao.bloqueio, null)
})

test('o ticket é de disparo por qualquer um dos dois marcadores', () => {
  assert.equal(ticketEhDisparo({ is_disparo: true, disparo_em: null }), true)
  assert.equal(ticketEhDisparo({ is_disparo: null, disparo_em: '2026-08-13T12:00:00Z' }), true)
  assert.equal(ticketEhDisparo({ is_disparo: false, disparo_em: null }), false)
  assert.equal(ticketEhDisparo({}), false)
  assert.equal(ticketEhDisparo(null), false)
  assert.equal(ticketEhDisparo(undefined), false)
})

test('flag desligada permite encerrar sem nem consultar', () => {
  const decisao = decidirEncerramento(false, null)

  assert.equal(decisao.permite, true)
  assert.equal(decisao.bloqueio, null)
  // Sem flag não há o que avisar — o comportamento é o de hoje.
  assert.equal(decisao.aviso, null)
})

test('flag desligada permite mesmo quando a consulta diria que não tem OC', () => {
  const semOc = interpretarRespostaOc(404, null)

  assert.equal(semOc.situacao, 'sem-oc')
  assert.equal(decidirEncerramento(false, semOc).permite, true)
})

test('404 é resposta clara de que não existe OC e bloqueia', () => {
  const decisao = encerrarComFlagLigada(404, '{"statusCode":404,"message":"Ticket não encontrado"}')

  assert.equal(decisao.permite, false)
  assert.equal(decisao.bloqueio, MENSAGEM_SEM_OC)
})

test('200 com lista vazia bloqueia', () => {
  assert.equal(encerrarComFlagLigada(200, '[]').permite, false)
})

test('200 com envelope de lista vazia bloqueia', () => {
  assert.equal(encerrarComFlagLigada(200, '{"data":[],"total":0}').permite, false)
})

test('200 com corpo nulo bloqueia', () => {
  assert.equal(encerrarComFlagLigada(200, 'null').permite, false)
})

test('OC existente permite encerrar, em qualquer um dos formatos plausíveis', () => {
  const formatos = {
    'objeto direto': '{"numero":164347,"status":"aberto"}',
    'lista com um registro': '[{"numero":"164347"}]',
    'envelope data com objeto': '{"data":{"numero":164347}}',
    'envelope data com lista': '{"data":[{"protocolo":"OC-9911"}],"total":1}',
    'envelope aninhado': '{"data":{"ticket":{"codigo":"A-77"}}}',
    'envelope items': '{"items":[{"id":"550e8400-e29b-41d4-a716-446655440000"}]}',
  }

  for (const [rotulo, corpo] of Object.entries(formatos)) {
    const consulta = interpretarRespostaOc(200, corpo)
    assert.equal(consulta.situacao, 'com-oc', `${rotulo} deveria indicar OC existente`)
    assert.equal(decidirEncerramento(true, consulta).permite, true, rotulo)
  }
})

test('a resposta real do Service Desk é reconhecida como OC existente', () => {
  const consulta = interpretarRespostaOc(200, OC_REAL, 164494)

  assert.equal(consulta.situacao, 'com-oc')
  // `id` é a OC; 164494 é o ticket do Hub. Quem o atendente precisa ver é a OC.
  assert.equal(consulta.identificacao, '10790936')
  assert.equal(decidirEncerramento(true, consulta).permite, true)
  assert.equal(
    descreverOcExistente(consulta),
    'A OC 10790936 já está aberta para este ticket.',
  )
})

test('lista vazia para um ticket real é a evidência de que falta a OC', () => {
  // 164371 e 164372, encerrados em 13/08/2026 sem OC nenhuma.
  const decisao = encerrarComFlagLigada(200, '[]', 164371)

  assert.equal(decisao.permite, false)
  assert.equal(decisao.bloqueio, MENSAGEM_SEM_OC)
})

test('OC de outro ticket libera e avisa — nunca vira "sem OC"', () => {
  const consulta = interpretarRespostaOc(200, OC_REAL, 164495)
  const decisao = decidirEncerramento(true, consulta)

  assert.equal(consulta.situacao, 'indeterminado')
  assert.equal(decisao.permite, true)
  assert.equal(decisao.bloqueio, null)
  assert.match(decisao.aviso, /outro ticket/)
})

test('o número consultado é comparado como texto, sem depender do tipo', () => {
  for (const numero of [164494, '164494', ' 164494 ']) {
    assert.equal(interpretarRespostaOc(200, OC_REAL, numero).situacao, 'com-oc', `número: ${numero}`)
  }

  // Sem número esperado a conferência não roda: o registro vale por si.
  assert.equal(interpretarRespostaOc(200, OC_REAL).situacao, 'com-oc')
})

test('registro sem o campo ticket é aceito — não dá para desmentir', () => {
  const consulta = interpretarRespostaOc(200, '[{"id":10790936,"status":"aberto"}]', 164494)

  assert.equal(consulta.situacao, 'com-oc')
  assert.equal(consulta.identificacao, '10790936')
})

test('a identificação da OC sai da resposta quando ela traz', () => {
  assert.equal(interpretarRespostaOc(200, '{"numero":164347}').identificacao, '164347')
  assert.equal(interpretarRespostaOc(200, '{"protocolo":"OC-9911"}').identificacao, 'OC-9911')
  assert.equal(interpretarRespostaOc(200, '{"data":{"codigo":"A-77"}}').identificacao, 'A-77')
})

test('401, 403 e 500 liberam o encerramento e avisam', () => {
  // O 401 é o estado REAL da rota hoje: a chave não existe em nenhum ambiente.
  const corpo401 = '{"statusCode":401,"message":"API Key ausente. Forneça o header x-api-key."}'

  for (const [status, corpo] of [[401, corpo401], [403, '{}'], [500, 'Internal Server Error']]) {
    const consulta = interpretarRespostaOc(status, corpo)
    const decisao = decidirEncerramento(true, consulta)

    assert.equal(consulta.situacao, 'indeterminado', `status ${status}`)
    assert.equal(decisao.permite, true, `status ${status} tem que liberar`)
    assert.equal(decisao.bloqueio, null, `status ${status}`)
    assert.match(decisao.aviso, new RegExp(String(status)), `status ${status} deveria aparecer no aviso`)
  }
})

test('timeout e rede fora liberam o encerramento e avisam', () => {
  const decisao = decidirEncerramento(
    true,
    ocIndeterminada('a consulta de OC falhou: The operation was aborted due to timeout'),
  )

  assert.equal(decisao.permite, true)
  assert.equal(decisao.bloqueio, null)
  assert.match(decisao.aviso, /timeout/)
})

test('corpo que não é JSON libera o encerramento', () => {
  const decisao = encerrarComFlagLigada(200, '<html><body>502 Bad Gateway</body></html>')

  assert.equal(decisao.permite, true)
  assert.match(decisao.aviso, /não é JSON/)
})

test('200 com corpo vazio libera — vazio não é evidência de ausência', () => {
  for (const corpo of ['', '   ', null, undefined]) {
    const decisao = encerrarComFlagLigada(200, corpo)
    assert.equal(decisao.permite, true)
    assert.match(decisao.aviso, /corpo vazio/)
  }
})

test('formato desconhecido libera, nunca bloqueia', () => {
  const desconhecidos = ['{}', '"ok"', '42', '{"mensagem":"consulte outro endpoint"}', '[1,2,3]']

  for (const corpo of desconhecidos) {
    const consulta = interpretarRespostaOc(200, corpo)
    assert.equal(consulta.situacao, 'indeterminado', `corpo: ${corpo}`)
    assert.equal(decidirEncerramento(true, consulta).permite, true, `corpo: ${corpo}`)
  }
})

test('consulta ausente com a flag ligada libera e avisa', () => {
  const decisao = decidirEncerramento(true, null)

  assert.equal(decisao.permite, true)
  assert.match(decisao.aviso, /não chegou a rodar/)
})

test('o aviso de OC já aberta só aparece quando existe OC', () => {
  assert.equal(
    descreverOcExistente({ situacao: 'com-oc', identificacao: '164347' }),
    'A OC 164347 já está aberta para este ticket.',
  )
  assert.equal(
    descreverOcExistente({ situacao: 'com-oc', identificacao: null }),
    'Já existe uma OC aberta para este ticket.',
  )
  assert.equal(descreverOcExistente({ situacao: 'sem-oc', identificacao: null }), null)
  assert.equal(descreverOcExistente({ situacao: 'indeterminado', identificacao: null }), null)
  assert.equal(descreverOcExistente(null), null)
})
