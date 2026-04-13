# SoftcomHub — Plano Completo de Melhoria de Produto
**Data:** 07 de abril de 2026
**Agente:** PM Agent (Product Manager Estratégico)

---

## 1. Diagnóstico Estratégico

### Estado Atual

O SoftcomHub está em estágio de **MVP tardio com dívida técnica crítica acumulada**. O produto tem a arquitetura conceitual correta (multicanal, tempo real, separação dashboard/workdesk), mas apresenta falhas que o tornam inapto para escala comercial e juridicamente exposto em qualquer auditoria de segurança.

| Dimensão | Estado Atual | Onde Deveria Estar |
|---|---|---|
| Segurança | Credenciais hardcoded, endpoints admin abertos, sem rate limiting | Autenticação em 100% dos endpoints, secrets em variáveis de ambiente, HMAC validado |
| Confiabilidade | ignoreBuildErrors=true, erros silenciosos, tela branca no loading | CI/CD com build gate, monitoramento de erros com alertas, UX de loading consistente |
| UX Atendente | Funcional mas com gaps (botões sem ação, sem validação de forms) | Fluxo sem fricção, feedback imediato, acessibilidade básica |
| Observabilidade | error_logs existe, métricas de produto ausentes | Dashboard de saúde do sistema + métricas de negócio em tempo real |
| Manutenibilidade | 50+ SQLs soltos, duplicações, README vazio | Migrations versionadas, código DRY, documentação mínima operacional |
| Escalabilidade | Round-robin funcional, sem fila explícita, sem SLA | Filas com prioridade, SLA configurável por setor, alertas de breach |

### Veredicto

O produto **não pode ser vendido para clientes enterprise** no estado atual. Pode operar para clientes pequenos tolerantes a risco. O gap principal não é de funcionalidade — é de fundação. Construir features em cima desta base acelera o custo da dívida técnica.

---

## 2. Personas e Jobs-to-be-Done

### Persona 1 — Supervisor de Atendimento ("Carla, 34 anos")

| Job-to-be-Done | Dor Hoje |
|---|---|
| Saber em tempo real quem está atendendo o quê | Status online/offline apenas por cor sem contexto de carga |
| Redistribuir tickets quando atendente some | Sem ferramenta de reatribuição em massa |
| Entender gargalos do dia anterior | Métricas básicas existem, sem drill-down |
| Configurar horários e pausas sem depender de dev | UI existe mas sem validação |
| Auditar o que foi dito a um cliente | Histórico existe mas sem filtros avançados |

### Persona 2 — Atendente ("Lucas, 22 anos")

| Job-to-be-Done | Dor Hoje |
|---|---|
| Responder rápido com templates | Templates existem, sem busca/atalho rápido |
| Saber quando uma mensagem foi entregue/lida | Status de entrega não visível |
| Transferir ticket para colega certo | Sem contexto de carga do colega destino |
| Pausar sem burocracia | Fluxo não documentado |
| Receber notificações de tickets novos | Botão de notificações sem ação |

### Persona 3 — Admin/Dono ("Ricardo, 41 anos")

| Job-to-be-Done | Dor Hoje |
|---|---|
| Ver ROI do canal WhatsApp vs Discord | Métricas não segmentadas por canal |
| Criar novo setor sem quebrar nada | Sem documentação, processo frágil |
| Garantir que clientes não fiquem sem resposta | Sem alertas de SLA breach |
| Integrar com CRM/ERP via API | API documentada internamente, sem SDK ou webhooks de saída padronizados |
| Auditar acesso e ações dos colaboradores | Sem audit log de ações administrativas |

### Persona 4 — Integrador/Dev ("Ana, 28 anos")

| Job-to-be-Done | Dor Hoje |
|---|---|
| Consumir dados via API com segurança | 8+ endpoints sem auth, token exposto em /api/setor/lookup |
| Receber eventos via webhook de saída | Webhooks de entrada existem, saída não padronizada |
| Entender o schema do banco | 50+ SQLs soltos sem documentação consolidada |

---

## 3. Gaps de Produto — Funcionalidades Ausentes de Alto Valor

### Bloqueadores de Venda (Segurança e Confiança)

| Gap | Impacto | Complexidade |
|---|---|---|
| Mover secrets para variáveis de ambiente | Crítico | Baixa |
| Autenticar endpoints admin abertos | Crítico | Baixa-Média |
| Validação HMAC webhook WhatsApp | Alto | Baixa |
| Rate limiting por IP e por token | Alto | Média |
| Headers de segurança HTTP | Médio-Alto | Baixa |

### Produto Core (Gaps de Feature)

| Gap | Personas Afetadas | Receita Potencial |
|---|---|---|
| Notificações funcionais (push/browser) | Atendente, Supervisor | Retenção |
| Status de entrega/leitura de mensagens | Atendente | Satisfação |
| SLA configurável + alertas de breach | Supervisor, Admin | Upsell enterprise |
| Busca em histórico de conversas | Atendente, Supervisor | Produtividade |
| Relatórios exportáveis (CSV/PDF) | Admin, Supervisor | Churn reduction |
| Webhooks de saída padronizados | Integrador | Expansão de mercado |
| Audit log de ações administrativas | Admin | Compliance, enterprise |
| Fila com prioridade | Supervisor | Diferenciação |
| CSAT pós-atendimento | Admin | Métrica de qualidade |
| App mobile ou PWA para atendentes | Atendente | Adoção |

---

## 4. Mapa de Valor — Matriz Impacto × Esforço

### Quadrante A — Faça Agora (Alto Impacto, Baixo Esforço)

| Item | Impacto | Esforço |
|---|---|---|
| Mover secrets para variáveis de ambiente | Crítico | 1–2 dias |
| Autenticar endpoints admin abertos | Crítico | 2–3 dias |
| Validação HMAC webhook WhatsApp | Alto | 1 dia |
| Corrigir loading.tsx (tela branca) | Alto UX | 2h |
| Corrigir lang="en" para "pt-BR" | Acessibilidade | 30min |
| Renderizar erros silenciosos (setError) | Alto UX | 1 dia |
| Notificações — conectar botão à lógica | Alto UX | 2–3 dias |
| Headers de segurança HTTP | Médio-Alto | 4h |
| Consolidar para 1 sistema de toast | Qualidade | 1 dia |

### Quadrante B — Planeje com Cuidado (Alto Impacto, Alto Esforço)

| Item | Impacto | Esforço |
|---|---|---|
| SLA configurável + alertas de breach | Alto negocial | 2–3 semanas |
| Sistema de migrations formal | Alto técnico | 1 semana |
| Relatórios exportáveis | Alto negocial | 2 semanas |
| CSAT pós-atendimento | Alto produto | 2–3 semanas |
| Webhooks de saída padronizados | Alto integração | 2 semanas |
| Testes automatizados (base) | Alto qualidade | ongoing |
| Audit log administrativo | Alto compliance | 2 semanas |

### Quadrante C — Quick Wins de Qualidade (Baixo Impacto, Baixo Esforço)

- Skeleton consistente entre páginas
- Breadcrumbs no header do dashboard
- Validação client-side nos formulários
- Corrigir flash de tema
- Carregar fonte corretamente
- Status online com tooltip + carga (não só cor)

### Quadrante D — Evite ou Adie

| Item | Observação |
|---|---|
| App mobile nativo | PWA resolve 80% do caso de uso com 20% do esforço |
| Reescrita de stack | Não há justificativa técnica agora |
| BI integrado | Exportação de dados + integração com Metabase resolve |

---

## 5. Roadmap Trimestral 2026

### Q2 2026 (Abril–Junho) — Tema: "Fundação Segura"

**Objetivo:** Tornar o produto vendável sem exposição jurídica e técnica.

| Semana | Entrega |
|---|---|
| S1–S2 | Todos os secrets movidos para env vars; endpoints admin autenticados |
| S2 | HMAC no webhook WhatsApp; headers de segurança HTTP |
| S3 | Rate limiting; loading.tsx corrigido; erros renderizados |
| S4 | Sistema de migrations formal; ignoreBuildErrors=false com build limpo |
| S5–S6 | Notificações browser funcionais; unificação de toast |
| S7–S8 | Validação client-side em formulários críticos |
| S9–S10 | Skeleton consistente; breadcrumbs; status com contexto de carga |
| S11–S12 | Audit log de ações admin; README operacional |

**Gate de Q2:** Produto passa em checklist básico de segurança OWASP Top 10.

### Q3 2026 (Julho–Setembro) — Tema: "Produto que Retém"

| Sprint | Entrega |
|---|---|
| S1–S2 | SLA configurável por setor + indicador visual no Workdesk |
| S3–S4 | Alertas de breach de SLA (email + notificação in-app) |
| S5–S6 | Busca em histórico de conversas |
| S7–S8 | Status de entrega/leitura de mensagens no chat |
| S9–S10 | CSAT pós-atendimento |
| S11–S12 | Relatórios exportáveis |

**Gate de Q3:** NPS interno de atendentes >= 7; Supervisor extrai relatório sem suporte.

### Q4 2026 (Outubro–Dezembro) — Tema: "Escala e Integração"

| Sprint | Entrega |
|---|---|
| S1–S2 | Webhooks de saída padronizados |
| S3–S4 | API com autenticação por token rotativo + documentação pública |
| S5–S6 | Fila com prioridade e regras configuráveis |
| S7–S8 | PWA para atendentes mobile |
| S9–S10 | Testes automatizados: unitários + E2E em fluxos core |
| S11–S12 | Dashboard de saúde operacional |

**Gate de Q4:** 1 cliente enterprise integrado via API; cobertura de testes >= 40% em código crítico.

---

## 6. OKRs Sugeridos

### OKR 1 — Segurança e Confiabilidade (Q2)

| Key Result | Meta | Como Medir |
|---|---|---|
| KR1 | 0 credenciais hardcoded no repositório | Scan automatizado no CI |
| KR2 | 100% dos endpoints admin autenticados | Teste de penetração + cobertura de rota |
| KR3 | ignoreBuildErrors=false com 0 erros de build | CI/CD pipeline |
| KR4 | Tempo de tela branca no loading = 0 | Teste manual de navegação |

### OKR 2 — Experiência do Atendente (Q3)

| Key Result | Meta | Como Medir |
|---|---|---|
| KR1 | NPS do Workdesk >= 7 | Survey trimestral interno |
| KR2 | Tempo médio para encontrar histórico de cliente < 15s | Teste de usabilidade |
| KR3 | 0 tickets sem SLA definido em setores configurados | Query no banco |
| KR4 | Taxa de adoção de CSAT >= 60% dos tickets fechados | disparo_logs / tickets fechados |

### OKR 3 — Capacidade de Integração (Q4)

| Key Result | Meta | Como Medir |
|---|---|---|
| KR1 | API pública documentada com >= 15 endpoints cobertos | Contagem de paths no OpenAPI spec |
| KR2 | >= 3 eventos de webhook de saída disponíveis | Changelog de produto |
| KR3 | >= 1 integração de cliente enterprise em produção | CRM interno |
| KR4 | Cobertura de testes >= 40% em módulos críticos | Relatório de cobertura no CI |

---

## 7. Métricas de Produto Ausentes

### Métricas de Atendimento

| Métrica | Por que importa | Como instrumentar |
|---|---|---|
| Tempo de primeira resposta (FRT) | SLA base | timestamps mensagens: primeira resposta do atendente |
| Tempo de resolução (TRT) | Eficiência operacional | timestamps abertura/fechamento |
| Taxa de reabertura | Qualidade da resolução | tickets fechados e reabertos no mesmo dia |
| Volume de tickets por hora | Planejamento de escala | agrupamento por hora em tickets.created_at |
| Taxa de abandono | Experiência do cliente | query periódica + alerta |
| CSAT score por atendente e setor | Qualidade percebida | coleta pós-atendimento (ausente hoje) |

### Métricas de Canal

| Métrica | Por que importa |
|---|---|
| Volume por canal (WhatsApp vs Discord vs Evolution) | Priorização de investimento |
| Taxa de entrega vs erro por canal | Saúde da integração |
| Custo por mensagem (WhatsApp Cloud API cobra por template) | P&L do produto |
| Latência média de entrega | Experiência do usuário final |

### Métricas de Colaborador

| Métrica | Por que importa |
|---|---|
| Tickets simultâneos por atendente | Capacidade real vs teórica |
| Tempo médio em pausa por turno | Gestão de capacidade |
| Taxa de transferência de tickets | Pode indicar especialização inadequada |
| Tickets resolvidos por hora | Produtividade comparável |

---

## 8. Riscos Estratégicos

### Risco 1 — Incidente de Segurança em Produção
**Probabilidade:** Alta. **Impacto:** Catastrófico.
Credenciais hardcoded + endpoints sem auth + webhook sem validação cria superfície de ataque trivial. Não é "se", é "quando".
**Mitigação:** Sprint dedicado de segurança antes de qualquer aquisição de cliente novo.

### Risco 2 — Dívida Técnica Travando Velocidade
**Probabilidade:** Certa se não tratada. **Impacto:** Alto.
50+ SQLs soltos, duplicações, ignoreBuildErrors=true e zero testes significa que cada nova feature cria riscos de regressão.
**Mitigação:** Migrations formais em Q2; policy "sem PR sem teste unitário" a partir de Q3.

### Risco 3 — Churn por Falta de Dados para o Cliente
**Probabilidade:** Média-Alta. **Impacto:** Alto.
Supervisores tomam decisões baseadas em feeling porque não há relatórios exportáveis nem métricas de SLA.
**Mitigação:** Relatórios exportáveis como prioridade de Q3, não feature secundária.

### Risco 4 — Dependência de Canal Único (WhatsApp Cloud API)
**Probabilidade:** Média. **Impacto:** Alto.
Meta tem histórico de mudanças unilaterais de preço/regras. O produto não tem diferencial claro nos outros canais.
**Mitigação:** Roadmap de paridade de features entre canais; métricas por canal para mostrar valor relativo.

### Risco 5 — Produto Sem Diferenciação Clara
**Probabilidade:** Média. **Impacto:** Médio-Alto.
Mercado denso (Zendesk, Chatwoot, Treble.ai). Round-robin e multicanal não são diferenciais em 2026.
**Mitigação:** Escolher 1 diferencial e executar com excelência — candidatos: (a) custo mais baixo para PMEs brasileiras, (b) integração nativa com n8n, (c) especialização vertical.

### Risco 6 — Conformidade com LGPD
**Probabilidade:** Latente. **Impacto:** Alto.
Sem audit log, sem política de retenção, sem mecanismo de exclusão de dados a pedido.
**Mitigação:** Audit log em Q2; política de retenção e exclusão em Q3; revisar termos com jurídico.

---

## Resumo Executivo

O SoftcomHub tem arquitetura correta e visão de produto clara, mas opera com dívida técnica e de segurança que o torna um passivo antes de ser um ativo para qualquer cliente que faça due diligence mínima.

**Sequência correta:**
1. **Agora (Q2):** Pagar a dívida de segurança — não é opcional, é pré-condição para tudo.
2. **Q3:** Instrumentar e reter — métricas, SLA, relatórios, CSAT.
3. **Q4:** Escalar — API pública, webhooks de saída, diferenciação de canal.

**O maior risco não é a concorrência. É um incidente de segurança ou um churn silencioso causado por falta de dados.**
