/**
 * Regressão descoberta em 28/07/2026 — o modal de detalhes em Dashboard →
 * Tickets abria sem log e sem mensagem, calado, havia meses.
 *
 * Causa: as duas consultas ordenavam por `created_at`, coluna que não existe
 * (é `criado_em` em `ticket_logs` e `enviado_em` em `mensagens`). O PostgREST
 * recusava, o código descartava o `error`, e a tela renderizava o nada.
 *
 * Por isso o teste vigia o STATUS das consultas, não só o que aparece: uma
 * seção vazia pode ser legítima, uma consulta recusada nunca é.
 */
describe('Detalhes do ticket', () => {
  beforeEach(() => {
    cy.entrarComoAtendente()
    cy.vigiarConsultas()
  })

  it('abre sem nenhuma consulta recusada pelo banco', () => {
    cy.visit('/dashboard/tickets')

    cy.get('table tbody tr', { timeout: 20000 }).should('have.length.greaterThan', 0)
    cy.abrirPrimeiraConversa()

    cy.get('[role="dialog"]').should('be.visible')

    // A checagem que importa: nenhuma consulta pode ter voltado 4xx. Era esse o
    // sintoma real — não uma tela quebrada, uma tela vazia.
    cy.nenhumaConsultaComErro()
  })

  it('mostra a conversa do ticket, ou diz que não há', () => {
    cy.visit('/dashboard/tickets')
    cy.get('table tbody tr', { timeout: 20000 }).should('have.length.greaterThan', 0)
    cy.abrirPrimeiraConversa()

    cy.get('[role="dialog"]').within(() => {
      // Uma das duas: conteúdo, ou um estado vazio explícito. O que não pode é
      // a região existir sem nada e sem explicação, que era o comportamento.
      cy.get('body').then(() => {
        cy.contains(/mensagem|conversa|histórico|nenhum/i).should('exist')
      })
    })
  })
})
