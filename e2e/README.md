# Testes de ponta a ponta

Cobrem o que teste unitário não alcança: comportamento de tela. Existem porque
em 28/07/2026 três bugs passaram por `tsc`, pelos 222 testes e pelo build —
rolagem pulando sozinha, anexo indo para o cliente errado e transferência sem
destinos.

## Antes de rodar

1. Suba a aplicação (o `baseUrl` padrão é `http://localhost:3002`):

       node --use-system-ca ./node_modules/next/dist/bin/next start -p 3002

2. Copie as credenciais e preencha:

       cp e2e/cypress.env.example.json e2e/cypress.env.json

   `cypress.env.json` não é versionado. Nunca escreva usuário ou senha dentro
   de uma spec.

## Rodar

    npm run test:e2e        # sem interface, para CI
    npm run test:e2e:open   # com a interface, para desenvolver

## Leitura apenas

O projeto tem **um banco só, compartilhado com produção**. Um teste que
clicasse em "Enviar" mandaria WhatsApp para um cliente de verdade.

Por isso `cypress/support/e2e.js` bloqueia toda escrita — POST, PUT, PATCH e
DELETE são recusados antes de sair do navegador, e o teste falha explicando o
que tentou passar. Só o login é liberado.

Isso é uma trava, não uma convenção. Quando existir um setor de teste (canal
apontando para um número controlado) ou um banco separado, dá para liberar por
spec com `cy.permitirEscrita()`.

## O que cada spec protege

| Spec | Regressão que ela pega |
|---|---|
| `01-transferencia` | campo "Setor de destino" vazio; setor atual fora da lista |
| `02-detalhes-ticket` | modal abrindo sem log e sem mensagem, calado |
| `03-rolagem-conversa` | conversa voltando sozinha para o fim ao reler |

## Por que vigiar o status das consultas

`cy.nenhumaConsultaComErro()` falha se qualquer consulta ao PostgREST voltar
4xx. É a checagem mais valiosa aqui: os bugs do dia não apareceram como tela
quebrada, e sim como tela **vazia** — a consulta era recusada, o código
descartava o `error` e a interface renderizava o nada.
