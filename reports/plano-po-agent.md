# SoftcomHub — Product Backlog & Sprint Plan
**Data:** 07 de abril de 2026
**Agente:** PO Agent (Product Owner)
**Versão:** 1.0

---

## 1. Definition of Done (DoD)

Critérios que toda história deve satisfazer antes de ser considerada "pronta":

| # | Critério |
|---|----------|
| 1 | Código revisado por ao menos 1 outro desenvolvedor (Pull Request aprovado) |
| 2 | TypeScript sem erros — `ignoreBuildErrors: false` aplicado ao escopo da história |
| 3 | Testes automatizados escritos: unitário para lógica de negócio, integração para endpoints |
| 4 | Sem segredos hardcoded — validado por `git-secrets` ou equivalente no CI |
| 5 | Variáveis de ambiente documentadas em `.env.example` |
| 6 | Endpoints novos ou alterados possuem autenticação verificada e testada |
| 7 | UI revisada em mobile (375px) e desktop (1280px) |
| 8 | Sem erros no console do navegador em fluxo principal |
| 9 | Deploy em ambiente de staging sem regressões |
| 10 | Critérios de aceite da história verificados manualmente pelo PO |

---

## 2. Backlog Completo

### Legenda de Prioridade MoSCoW
- **M** — Must Have (bloqueador de produção ou risco crítico)
- **S** — Should Have (valor alto, não bloqueador imediato)
- **C** — Could Have (melhoria de qualidade/UX)
- **W** — Won't Have (this cycle)

### Tabela de Backlog

| ID | Épico | Título | MoSCoW | SP | Dependências |
|----|-------|--------|--------|----|--------------|
| US-01 | EP-01 | Remover senha master hardcoded e mover para variável de ambiente segura | M | 3 | — |
| US-02 | EP-01 | Remover chave Evolution API hardcoded dos 3 arquivos | M | 3 | — |
| US-03 | EP-01 | Remover credenciais Basic Auth hardcoded de lib/painel-auth.ts | M | 2 | — |
| US-04 | EP-01 | Adicionar autenticação nos 8+ endpoints admin sem proteção | M | 8 | US-01 |
| US-05 | EP-01 | Corrigir /api/setor/lookup que expõe tokens sem autenticação | M | 3 | US-04 |
| US-06 | EP-01 | Implementar validação HMAC nos webhooks do WhatsApp | M | 5 | US-02 |
| US-07 | EP-01 | Implementar rate limiting nos endpoints públicos e de autenticação | M | 5 | US-04 |
| US-08 | EP-01 | Adicionar headers de segurança HTTP (CSP, HSTS, X-Frame-Options, etc.) | M | 3 | — |
| US-09 | EP-04 | Desativar ignoreBuildErrors e corrigir erros TypeScript existentes | M | 8 | — |
| US-10 | EP-02 | Corrigir loading.tsx para exibir skeleton em vez de null (tela branca) | M | 2 | — |
| US-11 | EP-02 | Renderizar mensagens de erro de fetch na UI (erros silenciosos) | S | 3 | — |
| US-12 | EP-02 | Corrigir flash de tema no carregamento (ThemeProvider no layout raiz) | S | 2 | — |
| US-13 | EP-02 | Corrigir atributo lang="en" para lang="pt-BR" no HTML | S | 1 | — |
| US-14 | EP-02 | Implementar funcionalidade real no botão de notificações | S | 5 | US-04 |
| US-15 | EP-02 | Definir destino e conteúdo da Central de Ajuda na sidebar | C | 3 | — |
| US-16 | EP-02 | Melhorar indicador de status online/offline com texto + cor | S | 2 | — |
| US-17 | EP-02 | Adicionar autocomplete nos campos de login | S | 1 | — |
| US-18 | EP-02 | Criar UI de feedback para link de reset de senha expirado | S | 2 | US-04 |
| US-19 | EP-02 | Padronizar skeleton de carregamento entre todas as páginas | C | 3 | US-10 |
| US-20 | EP-02 | Adicionar breadcrumb e título de página no header | C | 3 | — |
| US-21 | EP-04 | Consolidar hook use-toast em um único lugar | S | 2 | — |
| US-22 | EP-04 | Consolidar hook use-mobile em um único lugar | S | 1 | — |
| US-23 | EP-04 | Remover sistema de toast duplicado (manter shadcn ou sonner, remover o outro) | S | 3 | US-21 |
| US-24 | EP-04 | Eliminar páginas de login duplicadas (refatorar para componente compartilhado) | S | 5 | — |
| US-25 | EP-04 | Consolidar AVAILABLE_ICONS duplicado em arquivo único | S | 1 | — |
| US-26 | EP-04 | Mover createClient() para dentro dos componentes (evitar instância global) | S | 3 | — |
| US-27 | EP-03 | Dashboard de métricas em tempo real para supervisores | S | 8 | US-04, US-05 |
| US-28 | EP-03 | Relatório de SLA e tempo médio de atendimento | C | 5 | US-27 |
| US-29 | EP-05 | Implementar logging estruturado nos endpoints críticos | S | 5 | US-04 |
| US-30 | EP-05 | Configurar alertas de erro (ex: Sentry ou equivalente) | C | 3 | US-29 |

**Total de story points:** 114 SP

---

## 3. Histórias Detalhadas (Top 10 Prioritárias)

---

### US-01 — Remover senha master hardcoded

**Como** administrador de segurança,
**quero** que a senha master de login seja lida de uma variável de ambiente segura,
**para** que credenciais críticas não sejam expostas no código-fonte e em histórico de commits.

**Critérios de Aceite:**

- Dado que o arquivo `app/api/auth/master-login/route.ts` contém a string hardcoded,
  Quando o desenvolvedor aplicar o fix,
  Então nenhuma string de senha deve aparecer no código-fonte — apenas referência a `process.env.MASTER_PASSWORD`.

- Dado que a variável de ambiente não está definida,
  Quando o endpoint for chamado,
  Então deve retornar HTTP 500 com log de erro interno (sem expor detalhes ao cliente).

- Dado que a variável está corretamente definida,
  Quando o login master for realizado com a senha correta,
  Então deve autenticar com sucesso (comportamento existente preservado).

- Dado o arquivo `.env.example`,
  Quando o desenvolvedor clonar o repositório,
  Então deve encontrar a variável `MASTER_PASSWORD` documentada com valor de placeholder.

- Dado o pipeline de CI,
  Quando o PR for aberto,
  Então o CI deve falhar caso detecte padrões de senhas hardcoded.

**Pontos:** 3 | **Prioridade:** Must Have

---

### US-02 — Remover chave Evolution API hardcoded

**Como** administrador de segurança,
**quero** que a chave de API do Evolution seja configurada exclusivamente via variável de ambiente,
**para** que a chave não seja comprometida por acesso ao repositório.

**Critérios de Aceite:**

- Dado que a chave aparece hardcoded em 3 arquivos distintos,
  Quando o fix for aplicado,
  Então todos os 3 arquivos devem referenciar `process.env.EVOLUTION_API_KEY` — sem nenhuma string de chave literal.

- Dado que a variável está ausente no ambiente,
  Quando qualquer uma das funcionalidades dependentes for chamada,
  Então deve lançar erro claro no log do servidor e retornar resposta de erro controlada.

- Dado que a variável está presente e correta,
  Quando as funcionalidades Evolution API forem utilizadas,
  Então devem operar normalmente (sem regressão).

**Pontos:** 3 | **Prioridade:** Must Have

---

### US-03 — Remover credenciais Basic Auth hardcoded

**Como** administrador de segurança,
**quero** que as credenciais de autenticação Basic em `lib/painel-auth.ts` venham de variáveis de ambiente,
**para** que usuário e senha do painel não sejam expostos no repositório.

**Critérios de Aceite:**

- Dado que `lib/painel-auth.ts` contém usuário e senha hardcoded,
  Quando o fix for aplicado,
  Então o arquivo deve referenciar `process.env.PAINEL_USER` e `process.env.PAINEL_PASSWORD`.

- Dado que as variáveis estão ausentes,
  Quando o sistema inicializar,
  Então deve logar aviso crítico e bloquear acesso ao painel.

**Pontos:** 2 | **Prioridade:** Must Have

---

### US-04 — Autenticar os endpoints admin desprotegidos

**Como** administrador de segurança,
**quero** que todos os endpoints administrativos exijam autenticação válida,
**para** que operações sensíveis não sejam executáveis por qualquer requisição não autenticada.

**Critérios de Aceite:**

- Dado um endpoint como `/api/admin/create-user`,
  Quando chamado sem token de autenticação,
  Então deve retornar HTTP 401 com body `{ "error": "Unauthorized" }`.

- Dado um endpoint admin,
  Quando chamado com token válido de usuário com role `admin`,
  Então deve processar normalmente.

- Dado um endpoint admin,
  Quando chamado com token válido de usuário sem role `admin`,
  Então deve retornar HTTP 403 `{ "error": "Forbidden" }`.

- Dado o middleware de autenticação,
  Quando implementado,
  Então deve ser um módulo reutilizável (não duplicado por arquivo).

**Pontos:** 8 | **Prioridade:** Must Have

---

### US-05 — Proteger /api/setor/lookup contra vazamento de tokens

**Como** administrador de segurança,
**quero** que o endpoint `/api/setor/lookup` exija autenticação antes de retornar dados,
**para** que tokens de WhatsApp, Discord e Evolution API não sejam acessíveis publicamente.

**Critérios de Aceite:**

- Dado o endpoint `/api/setor/lookup`,
  Quando chamado sem autenticação,
  Então deve retornar HTTP 401 e não incluir nenhum campo de token na resposta.

- Dado o endpoint autenticado com permissão adequada,
  Quando chamado,
  Então deve retornar os dados normalmente.

- Dado um usuário sem permissão de leitura de tokens,
  Quando o endpoint for chamado,
  Então a resposta deve omitir os campos sensíveis.

**Pontos:** 3 | **Prioridade:** Must Have

---

### US-06 — Validação HMAC nos webhooks do WhatsApp

**Como** administrador de segurança,
**quero** que o endpoint de webhook do WhatsApp valide a assinatura HMAC de cada requisição,
**para** que apenas mensagens legítimas do WhatsApp Cloud API sejam processadas.

**Critérios de Aceite:**

- Dado uma requisição sem header `x-hub-signature-256`,
  Quando recebida,
  Então deve retornar HTTP 400 e não processar o payload.

- Dado uma requisição com assinatura HMAC inválida,
  Quando recebida,
  Então deve retornar HTTP 403 e registrar log com IP.

- Dado uma requisição com assinatura válida,
  Quando recebida,
  Então deve processar normalmente (sem regressão).

**Pontos:** 5 | **Prioridade:** Must Have

---

### US-07 — Rate limiting nos endpoints públicos e de autenticação

**Como** administrador de segurança,
**quero** que endpoints de login e públicos tenham limite de requisições por IP,
**para** prevenir ataques de força bruta e abuso de API.

**Critérios de Aceite:**

- Dado o endpoint de login,
  Quando um mesmo IP realizar mais de 10 requisições em 60 segundos,
  Então deve retornar HTTP 429 com header `Retry-After`.

- Dado o sistema de rate limiting,
  Quando implementado,
  Então deve usar Redis ou equivalente (não memória in-process) para funcionar em múltiplas instâncias.

**Pontos:** 5 | **Prioridade:** Must Have

---

### US-08 — Headers de segurança HTTP

**Como** administrador de segurança,
**quero** que a aplicação sirva headers de segurança HTTP em todas as respostas,
**para** proteger usuários contra XSS, clickjacking e outros ataques client-side.

**Critérios de Aceite:**

- Dado qualquer resposta HTTP,
  Quando inspecionada,
  Então deve conter: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`.

- Dado a ferramenta securityheaders.com,
  Quando o domínio de staging for avaliado,
  Então deve obter nota mínima "A".

**Pontos:** 3 | **Prioridade:** Must Have

---

### US-09 — Desativar ignoreBuildErrors e corrigir erros TypeScript

**Como** desenvolvedor,
**quero** que `ignoreBuildErrors: false` esteja ativo,
**para** que erros de tipo sejam detectados no build e não cheguem silenciosamente a produção.

**Critérios de Aceite:**

- Dado o `next.config.js`,
  Quando inspecionado,
  Então `typescript.ignoreBuildErrors` deve estar ausente ou `false`.

- Dado `npm run build`,
  Quando executado,
  Então deve completar sem erros de TypeScript.

**Pontos:** 8 | **Prioridade:** Must Have

---

### US-10 — Corrigir tela branca durante navegação (loading.tsx)

**Como** atendente,
**quero** ver um indicador visual de carregamento ao navegar entre páginas,
**para** não confundir tela branca com falha da aplicação.

**Critérios de Aceite:**

- Dado que `loading.tsx` atualmente retorna `null`,
  Quando o fix for aplicado,
  Então deve retornar um componente de skeleton ou spinner do design system.

- Dado uma navegação com latência simulada de 2 segundos,
  Quando o carregamento ocorrer,
  Então o skeleton deve aparecer imediatamente e desaparecer quando o conteúdo carregar.

**Pontos:** 2 | **Prioridade:** Must Have

---

## 4. Sprint 1 — Segurança Crítica & Fundação Técnica

**Capacidade:** 40 Story Points | **Duração:** 2 semanas
**Objetivo:** Eliminar vulnerabilidades críticas de segurança e estabilizar a fundação técnica.

| ID | Título | SP | MoSCoW |
|----|--------|----|--------|
| US-01 | Remover senha master hardcoded | 3 | M |
| US-02 | Remover chave Evolution API hardcoded | 3 | M |
| US-03 | Remover credenciais Basic Auth hardcoded | 2 | M |
| US-08 | Adicionar headers de segurança HTTP | 3 | M |
| US-09 | Desativar ignoreBuildErrors e corrigir TypeScript | 8 | M |
| US-10 | Corrigir loading.tsx (tela branca) | 2 | M |
| US-13 | Corrigir lang="en" para lang="pt-BR" | 1 | S |
| US-17 | Adicionar autocomplete nos campos de login | 1 | S |
| US-04 | Autenticar endpoints admin desprotegidos | 8 | M |
| US-22 | Consolidar hook use-mobile duplicado | 1 | S |
| US-25 | Consolidar AVAILABLE_ICONS duplicado | 1 | S |
| **Total** | | **33 SP** | |

**Critério de sucesso:**
- Nenhuma credencial hardcoded no repositório
- Build TypeScript passa sem `ignoreBuildErrors`
- Endpoints admin retornam 401 sem autenticação
- Headers de segurança com nota mínima "B"

---

## 5. Sprint 2 — Segurança Avançada & Qualidade de Código

**Capacidade:** 40 Story Points | **Duração:** 2 semanas
**Objetivo:** Completar postura de segurança e eliminar dívida técnica de alto impacto.

| ID | Título | SP | MoSCoW | Dep |
|----|--------|----|--------|-----|
| US-05 | Proteger /api/setor/lookup | 3 | M | US-04 ✓ |
| US-06 | Validação HMAC webhooks WhatsApp | 5 | M | US-02 ✓ |
| US-07 | Rate limiting nos endpoints | 5 | M | US-04 ✓ |
| US-11 | Renderizar erros de fetch na UI | 3 | S | — |
| US-12 | Corrigir flash de tema | 2 | S | — |
| US-21 | Consolidar hook use-toast | 2 | S | — |
| US-23 | Remover sistema de toast duplicado | 3 | S | US-21 ✓ |
| US-16 | Melhorar indicador status online/offline | 2 | S | — |
| US-26 | Mover createClient() para dentro de componentes | 3 | S | — |
| US-18 | UI para link de reset de senha expirado | 2 | S | US-04 ✓ |
| US-29 | Logging estruturado nos endpoints críticos | 5 | S | US-04 ✓ |
| **Total** | | **35 SP** | | |

---

## 6. Riscos de Execução

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R-01 | Escopo oculto em US-09 — erros TypeScript podem revelar mais problemas | Alta | Alto | Timebox de 3 dias para mapeamento antes do Sprint 1 |
| R-02 | Segredos em histórico de commits — remover hardcoded não é suficiente | Alta | Crítico | Rotação imediata das credenciais como pré-condição do Sprint 1 |
| R-03 | Regressão no fluxo de autenticação (US-04) | Média | Crítico | Deploy em staging com testes antes de produção; rollback plan |
| R-04 | Dependência de Redis para rate limiting (US-07) | Média | Médio | Usar Upstash Redis (serverless) compatível com Vercel |
| R-05 | Webhooks WhatsApp em produção durante US-06 | Média | Alto | Implementar com modo "log-only" antes de ativar o bloqueio |
| R-06 | Dívida TypeScript bloqueia CI | Alta | Médio | Branch isolada para US-09; não mergear até 100% corrigido |
| R-07 | Refatoração de login (US-24) afeta fluxos diferentes | Baixa | Médio | Mapear todos os fluxos antes; manter testes E2E por fluxo |
| R-08 | Ausência de testes no projeto aumenta custo real | Alta | Médio | Setup do framework de testes incluído nas primeiras histórias |

---

## Resumo Executivo

**Sprint 1 (33 SP):** Foco exclusivo em segurança crítica e fundação. Nenhuma nova feature até que credenciais hardcoded sejam removidas, endpoints admin protegidos e build TypeScript estabilizado.

**Sprint 2 (35 SP):** Completa a postura de segurança (HMAC, rate limiting, proteção de tokens) e elimina dívida técnica de maior custo operacional.

**A partir do Sprint 3:** A equipe estará em condições de entregar features de valor de negócio com base segura e sustentável.

**Ação imediata (hoje, fora do sprint):** Rotacionar todas as credenciais expostas no histórico de commits — senha master, chave Evolution API e credenciais Basic Auth.
