/**
 * Regressão de 28/07/2026 — o atendente subia na conversa para reler, parava, e
 * a visão voltava sozinha para o fim.
 *
 * Causa: o efeito de rolagem dependia da lista `mensagens` inteira, e ela é
 * recriada a cada recibo de entrega — um `.map()` muda a identidade do array
 * sem acrescentar mensagem nenhuma. O `setTimeout` de 100ms fazia o salto
 * acontecer solto de qualquer ação, que é a sensação de "rolou sozinho".
 *
 * A regra pura tem teste unitário (`tests/scroll-conversa.test.mjs`), mas a
 * ligação com o `onScroll` e o ref não tem — e era exatamente aí que o bug
 * vivia. Só o navegador pega.
 */
describe('Rolagem da conversa', () => {
  beforeEach(() => {
    cy.entrarComoAtendente()
  })

  it('não volta para o fim sozinha depois que o atendente sobe', () => {
    cy.visit('/workdesk')
    cy.abrirPrimeiraConversa()

    cy.get('[data-testid="messages-container"], .overflow-y-auto')
      .filter(':visible')
      .last()
      .as('conversa')

    // Só faz sentido testar em conversa que realmente rola.
    cy.get('@conversa').then(($area) => {
      const elemento = $area[0]
      if (elemento.scrollHeight <= elemento.clientHeight + 200) {
        cy.log('conversa curta demais para rolar — teste não se aplica')
        return
      }

      cy.get('@conversa').scrollTo(0, 0)
      cy.wait(500)

      cy.get('@conversa').then(($depois) => {
        const posicaoEscolhida = $depois[0].scrollTop

        // Tempo suficiente para o poll de 10s e algum recibo chegarem.
        cy.wait(12000)

        cy.get('@conversa').then(($final) => {
          const desvio = Math.abs($final[0].scrollTop - posicaoEscolhida)
          expect(desvio, 'a conversa não pode rolar sozinha depois de o atendente parar')
            .to.be.lessThan(50)
        })
      })
    })
  })

  it('começa no fim ao abrir uma conversa', () => {
    cy.visit('/workdesk')
    cy.abrirPrimeiraConversa()

    cy.get('[data-testid="messages-container"], .overflow-y-auto')
      .filter(':visible')
      .last()
      .should(($area) => {
        const elemento = $area[0]
        const distanciaDoFim = elemento.scrollHeight - elemento.clientHeight - elemento.scrollTop
        expect(distanciaDoFim, 'ao abrir, a conversa mostra a mensagem mais recente')
          .to.be.lessThan(150)
      })
  })
})
