import { defineConfig } from 'cypress'

/**
 * Testes de ponta a ponta, isolados nesta pasta.
 *
 * Existem porque em 28/07/2026 três bugs passaram por tudo que havia: rolagem
 * pulando sozinha, anexo indo para o cliente errado e transferência sem
 * destinos. Nos três, `tsc`, os 222 testes e o build passaram — nenhum deles é
 * lógica, são comportamento de tela.
 *
 * ATENÇÃO: o projeto tem UM banco só, compartilhado com produção. Estes testes
 * são de LEITURA. `support/e2e.js` bloqueia escrita de verdade, não por
 * convenção — um teste que mandasse mensagem enviaria WhatsApp a cliente real.
 */
export default defineConfig({
  // `Cypress.env()` entrega o valor ao código do navegador — a própria
  // ferramenta marca como inseguro e vai remover. Desligado aqui de propósito,
  // para que ninguém use por engano: senha se lê com `cy.env([...])`, que
  // mantém o valor no processo do Node.
  allowCypressEnv: false,
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3002',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/artefatos/screenshots',
    videosFolder: 'cypress/artefatos/videos',
    downloadsFolder: 'cypress/artefatos/downloads',
    video: false,
    screenshotOnRunFailure: true,
    viewportWidth: 1440,
    viewportHeight: 900,
    // A tela do atendente carrega bastante conversa; o padrão de 4s estoura à toa.
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    retries: { runMode: 2, openMode: 0 },
  },
})
