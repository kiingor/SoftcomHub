import './commands'

/**
 * Trava de escrita.
 *
 * O banco é o mesmo de produção. Um teste que clicasse em "Enviar" mandaria
 * WhatsApp para um cliente de verdade; um que criasse ticket entraria na fila
 * dos atendentes. Em vez de confiar que ninguém vai escrever um teste desses,
 * qualquer escrita derruba o teste na hora, dizendo o que tentou passar.
 *
 * Quando existir um setor de teste (ou um banco separado), dá para liberar por
 * spec com `cy.permitirEscrita()`.
 */

/** Só o login precisa escrever — é POST, mas não altera dado de operação. */
const ESCRITAS_PERMITIDAS = [
  /\/api\/auth\/master-login/,
  /\/auth\/v1\/token/,
  /\/auth\/v1\/logout/,
  /\/realtime\/v1/,
]

const METODOS_DE_ESCRITA = ['POST', 'PUT', 'PATCH', 'DELETE']

let escritaLiberada = false

Cypress.Commands.add('permitirEscrita', () => {
  escritaLiberada = true
})

beforeEach(() => {
  escritaLiberada = false

  cy.intercept({ url: '**' }, (req) => {
    if (!METODOS_DE_ESCRITA.includes(req.method)) return
    if (escritaLiberada) return
    if (ESCRITAS_PERMITIDAS.some((padrao) => padrao.test(req.url))) return

    // Responder com erro em vez de deixar passar: a requisição não chega ao
    // servidor, e o teste falha com a explicação em vez de um sintoma solto.
    req.reply({
      statusCode: 599,
      body: { erro: 'ESCRITA_BLOQUEADA_NO_TESTE' },
    })
    throw new Error(
      `Escrita bloqueada: ${req.method} ${req.url}\n`
      + 'Estes testes são de leitura porque o banco é o de produção. '
      + 'Se a escrita for mesmo necessária e segura, chame cy.permitirEscrita() na spec.',
    )
  })
})

// A tela do WorkDesk registra avisos de rede que não invalidam o teste.
Cypress.on('uncaught:exception', (erro) => {
  if (/ResizeObserver loop|Hydration failed/i.test(erro.message)) return false
  return true
})
