/**
 * Login por sessão, não pela tela.
 *
 * `cy.session` guarda os cookies entre specs, então o login acontece uma vez
 * por usuário na execução inteira em vez de a cada teste.
 *
 * As credenciais vêm de `cypress.env.json`, que NÃO é versionado. Nunca
 * escreva usuário ou senha dentro de uma spec.
 */
Cypress.Commands.add('entrarComoAtendente', () => {
  // `cy.env([...])` e não `Cypress.env(...)`: a senha fica no processo do Node
  // e nunca é entregue ao código que roda no navegador.
  cy.env(['EMAIL', 'SENHA']).then(({ EMAIL, SENHA }) => {
    if (!EMAIL || !SENHA) {
      throw new Error(
        'Faltam credenciais. Copie e2e/cypress.env.example.json para '
        + 'e2e/cypress.env.json e preencha EMAIL e SENHA.',
      )
    }

    cy.session([EMAIL], () => {
      cy.request({
        method: 'POST',
        url: '/api/auth/master-login',
        body: { email: EMAIL, senha: SENHA },
        failOnStatusCode: false,
      }).then((resposta) => {
        expect(resposta.status, 'login deve responder com sucesso').to.be.oneOf([200, 201])
      })
    })
  })
})

/**
 * Falha o teste se alguma consulta ao banco voltar com erro.
 *
 * É a checagem que mais importa aqui: os bugs de 28/07 não apareceram como
 * tela quebrada, e sim como tela VAZIA — o PostgREST recusava a consulta, o
 * código descartava o `error` e a interface renderizava o nada, sem aviso.
 */
Cypress.Commands.add('vigiarConsultas', (apelido = 'consultas') => {
  cy.intercept({ method: 'GET', url: '**/rest/v1/**' }).as(apelido)
})

Cypress.Commands.add('nenhumaConsultaComErro', (apelido = 'consultas') => {
  cy.get(`@${apelido}.all`, { timeout: 15000 }).then((chamadas) => {
    const falhas = (chamadas || []).filter((chamada) => chamada.response?.statusCode >= 400)
    const detalhe = falhas
      .map((f) => `${f.response.statusCode} ${decodeURIComponent(f.request.url).slice(0, 160)}`)
      .join('\n')
    expect(falhas.length, `consultas recusadas pelo banco:\n${detalhe}`).to.equal(0)
  })
})

/** Abre a tela do setor configurado para os testes. */
Cypress.Commands.add('abrirSetorDeTeste', () => {
  cy.env(['SETOR_ID']).then(({ SETOR_ID }) => {
    if (!SETOR_ID) {
      throw new Error('Defina SETOR_ID em e2e/cypress.env.json')
    }
    cy.visit(`/setor/${SETOR_ID}`)
  })
})

/** Abre a primeira conversa da lista, seja qual for a tela. */
Cypress.Commands.add('abrirPrimeiraConversa', () => {
  cy.get('[data-testid="ticket-item"], [role="row"], table tbody tr', { timeout: 20000 })
    .filter(':visible')
    .first()
    .click()
})
