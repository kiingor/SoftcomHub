/**
 * Regressão de 28/07/2026 — a aba Transferir abria com o campo "Setor de
 * destino" vazio e o menu sem uma linha sequer, inclusive para mandar a um
 * subsetor do próprio setor, que é o uso mais comum.
 *
 * Causa: o mapeamento de tickets da tela do setor não levava `setor_id`, e o
 * formulário aborta o carregamento quando ele falta. Nenhum teste unitário
 * pegaria — a lógica estava certa, faltava um campo na ponte entre as duas.
 */
describe('Transferência de ticket', () => {
  beforeEach(() => {
    cy.entrarComoAtendente()
    cy.vigiarConsultas()
  })

  it('lista destinos, incluindo o setor atual para transferir a um subsetor', () => {
    cy.abrirSetorDeTeste()
    cy.abrirPrimeiraConversa()

    cy.contains('button, [role="tab"]', 'Transferir').click()

    cy.get('[aria-label="Setor de destino"]').should('be.visible').click()

    // O bug: a lista abria sem nenhuma opção.
    cy.get('[role="option"]').should('have.length.greaterThan', 0)

    // E o setor atual precisa estar entre elas — é o que permite mandar para um
    // subsetor sem sair do setor.
    cy.get('[role="option"]').contains('Atual').should('exist')

    cy.nenhumaConsultaComErro()
  })

  it('avisa em texto quando não há destino, em vez de mostrar campo vazio', () => {
    // O modo de falha anterior era invisível: sem erro, sem log, sem aviso.
    // Se algum dia voltar a não haver destinos, tem que estar escrito na tela.
    cy.abrirSetorDeTeste()
    cy.abrirPrimeiraConversa()
    cy.contains('button, [role="tab"]', 'Transferir').click()

    cy.get('body').then(($corpo) => {
      const temSelect = $corpo.find('[aria-label="Setor de destino"]').length > 0
      if (!temSelect) {
        cy.contains(/não foi possível identificar o setor/i).should('be.visible')
      }
    })
  })
})
