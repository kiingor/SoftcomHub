---
trigger: always_on
priority: P0
---

# AGENT.md - Sistema Modular de Agentes e Skills

> Este arquivo define como a IA deve se comportar neste workspace. Funciona com qualquer modelo de IA (Claude, GPT, Gemini, LLaMA, etc.).

---

## PROTOCOLO INICIAL: AVALIACAO DO PROJETO

> **OBRIGATORIO:** No inicio de cada sessao, ANTES de qualquer tarefa, execute este protocolo.

### 1. Escanear o Projeto

Analise a raiz do projeto para detectar o tipo e as tecnologias:

| Arquivo/Pasta | Indica |
|---------------|--------|
| `package.json` | Node.js / JavaScript / TypeScript |
| `next.config.*` | Next.js |
| `nuxt.config.*` | Nuxt.js |
| `vite.config.*` | Vite (React/Vue/Svelte) |
| `angular.json` | Angular |
| `svelte.config.*` | SvelteKit |
| `astro.config.*` | Astro |
| `requirements.txt` / `pyproject.toml` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pubspec.yaml` | Flutter/Dart |
| `*.csproj` / `*.sln` | .NET / C# |
| `Gemfile` | Ruby |
| `docker-compose.yml` | Docker/Infra |
| `prisma/schema.prisma` | Prisma ORM |
| `drizzle.config.*` | Drizzle ORM |
| `tailwind.config.*` | Tailwind CSS |
| `.env` / `.env.local` | Variaveis de ambiente |
| `Dockerfile` | Containerizacao |
| `ios/` / `android/` | Mobile nativo |
| `app.json` / `expo` em package.json | React Native/Expo |

### 2. Classificar e Selecionar

Com base na deteccao, selecione automaticamente o agente e skills:

| Tipo de Projeto | Agente Padrao | Skills Auto-carregadas |
|----------------|---------------|------------------------|
| **Web Frontend** (Next.js, React, Vue, Svelte) | `frontend-specialist` | nextjs-react-expert, tailwind-patterns, frontend-design, web-design-guidelines |
| **API Backend** (Node.js, Express, Fastify) | `backend-specialist` | api-patterns, nodejs-best-practices, database-design |
| **Backend Python** (FastAPI, Django, Flask) | `backend-specialist` | api-patterns, python-patterns, database-design |
| **Fullstack Web** (Next.js + API + DB) | `orchestrator` | frontend-design, api-patterns, database-design, nextjs-react-expert |
| **Mobile** (React Native, Flutter, Expo) | `mobile-developer` | mobile-design |
| **Game** (Unity, Godot, Phaser, Three.js) | `game-developer` | game-development |
| **CLI / Infra / DevOps** | `devops-engineer` | bash-linux ou powershell-windows, deployment-procedures, server-management |
| **Rust** | `backend-specialist` | rust-pro |
| **Desconhecido** | `project-planner` | brainstorming, plan-writing |

**Skills SEMPRE carregadas (independente do projeto):**
- `clean-code` (CRITICAL - padrao de codigo obrigatorio)
- `rules/GLOBAL.md` (regras globais de comportamento)

### 3. Anunciar ao Usuario

Apos a deteccao, informe de forma concisa:

```
Projeto detectado: [tipo]
Tecnologias: [lista]
Agente ativo: [nome]
Skills carregadas: [lista]
```

---

## CATALOGO DE SKILLS

### Frontend & UI

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `nextjs-react-expert` | React & Next.js - performance, patterns, 57 regras | .agent/skills/nextjs-react-expert/SKILL.md |
| `tailwind-patterns` | Tailwind CSS v4 - utilitarios e patterns | .agent/skills/tailwind-patterns/SKILL.md |
| `frontend-design` | UI/UX patterns, design systems | .agent/skills/frontend-design/SKILL.md |
| `web-design-guidelines` | Web audit - 100+ regras acessibilidade, UX, perf | .agent/skills/web-design-guidelines/SKILL.md |
| `ui-ux-pro-max` | 50 estilos, 21 paletas, 50 fontes, tech stacks | .agent/skills/ui-ux-pro-max/ |

### Backend & API

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `api-patterns` | REST, GraphQL, tRPC patterns | .agent/skills/api-patterns/SKILL.md |
| `nodejs-best-practices` | Node.js async, modules, patterns | .agent/skills/nodejs-best-practices/SKILL.md |
| `python-patterns` | Python standards, FastAPI | .agent/skills/python-patterns/SKILL.md |
| `rust-pro` | Rust patterns e best practices | .agent/skills/rust-pro/SKILL.md |

### Database

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `database-design` | Schema design, otimizacao, migracoes | .agent/skills/database-design/SKILL.md |

### Testing & Quality

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `testing-patterns` | Jest, Vitest, estrategias de teste | .agent/skills/testing-patterns/SKILL.md |
| `webapp-testing` | E2E, Playwright | .agent/skills/webapp-testing/SKILL.md |
| `tdd-workflow` | Test-driven development | .agent/skills/tdd-workflow/SKILL.md |
| `code-review-checklist` | Padroes de code review | .agent/skills/code-review-checklist/SKILL.md |
| `lint-and-validate` | Linting, validacao | .agent/skills/lint-and-validate/SKILL.md |

### Security

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `vulnerability-scanner` | Security auditing, OWASP | .agent/skills/vulnerability-scanner/SKILL.md |
| `red-team-tactics` | Offensive security, red team | .agent/skills/red-team-tactics/SKILL.md |

### Architecture & Planning

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `app-builder` | Full-stack scaffolding, 13 templates | .agent/skills/app-builder/SKILL.md |
| `architecture` | System design patterns | .agent/skills/architecture/SKILL.md |
| `plan-writing` | Task planning, breakdown | .agent/skills/plan-writing/SKILL.md |
| `brainstorming` | Socratic questioning, discovery | .agent/skills/brainstorming/SKILL.md |

### Mobile

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `mobile-design` | Mobile UI/UX patterns | .agent/skills/mobile-design/SKILL.md |

### Game Development

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `game-development` | Game logic, mecanicas, multiplayer | .agent/skills/game-development/SKILL.md |

### SEO & Growth

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals | .agent/skills/seo-fundamentals/SKILL.md |
| `geo-fundamentals` | GenAI optimization | .agent/skills/geo-fundamentals/SKILL.md |

### Performance & Debug

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `performance-profiling` | Web Vitals, otimizacao | .agent/skills/performance-profiling/SKILL.md |
| `systematic-debugging` | Troubleshooting sistematico | .agent/skills/systematic-debugging/SKILL.md |

### Shell & CLI

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `bash-linux` | Linux commands, scripting | .agent/skills/bash-linux/SKILL.md |
| `powershell-windows` | Windows PowerShell | .agent/skills/powershell-windows/SKILL.md |

### Infrastructure

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `deployment-procedures` | CI/CD, deploy workflows | .agent/skills/deployment-procedures/SKILL.md |
| `server-management` | Infrastructure management | .agent/skills/server-management/SKILL.md |

### Core & System

| Skill | Descricao | Caminho |
|-------|-----------|---------|
| `clean-code` | Coding standards (GLOBAL, CRITICAL) | .agent/skills/clean-code/SKILL.md |
| `behavioral-modes` | Agent personas e modos | .agent/skills/behavioral-modes/SKILL.md |
| `parallel-agents` | Multi-agent patterns | .agent/skills/parallel-agents/SKILL.md |
| `intelligent-routing` | Auto-routing de agentes | .agent/skills/intelligent-routing/SKILL.md |
| `mcp-builder` | Model Context Protocol | .agent/skills/mcp-builder/SKILL.md |
| `documentation-templates` | Formatos de documentacao | .agent/skills/documentation-templates/SKILL.md |
| `i18n-localization` | Internacionalizacao | .agent/skills/i18n-localization/SKILL.md |

---

## CATALOGO DE AGENTES

| Agente | Foco | Skills | Caminho |
|--------|------|--------|---------|
| `orchestrator` | Coordenacao multi-agente | parallel-agents, behavioral-modes, plan-writing, brainstorming, architecture | .agent/agents/orchestrator.md |
| `project-planner` | Discovery, planejamento | brainstorming, plan-writing, app-builder | .agent/agents/project-planner.md |
| `frontend-specialist` | Web UI/UX, React/Next.js | nextjs-react-expert, web-design-guidelines, tailwind-patterns, frontend-design | .agent/agents/frontend-specialist.md |
| `backend-specialist` | API, logica de negocio | api-patterns, nodejs-best-practices, python-patterns, database-design, rust-pro | .agent/agents/backend-specialist.md |
| `database-architect` | Schema, SQL, otimizacao | database-design | .agent/agents/database-architect.md |
| `mobile-developer` | iOS, Android, RN, Flutter | mobile-design | .agent/agents/mobile-developer.md |
| `game-developer` | Game logic, mecanicas | game-development | .agent/agents/game-developer.md |
| `devops-engineer` | CI/CD, Docker, deploy | deployment-procedures, server-management | .agent/agents/devops-engineer.md |
| `security-auditor` | Security compliance, OWASP | vulnerability-scanner, red-team-tactics, api-patterns | .agent/agents/security-auditor.md |
| `penetration-tester` | Offensive security | red-team-tactics, vulnerability-scanner | .agent/agents/penetration-tester.md |
| `test-engineer` | Testing, TDD | testing-patterns, tdd-workflow, webapp-testing, code-review-checklist | .agent/agents/test-engineer.md |
| `debugger` | Root cause analysis | systematic-debugging | .agent/agents/debugger.md |
| `performance-optimizer` | Speed, Web Vitals | performance-profiling | .agent/agents/performance-optimizer.md |
| `seo-specialist` | Ranking, visibilidade | seo-fundamentals, geo-fundamentals | .agent/agents/seo-specialist.md |
| `documentation-writer` | Manuais, docs tecnicos | documentation-templates | .agent/agents/documentation-writer.md |
| `product-manager` | Requirements, user stories | plan-writing, brainstorming | .agent/agents/product-manager.md |
| `product-owner` | Estrategia, backlog, MVP | plan-writing, brainstorming | .agent/agents/product-owner.md |
| `qa-automation-engineer` | E2E testing, CI pipelines | webapp-testing, testing-patterns | .agent/agents/qa-automation-engineer.md |
| `code-archaeologist` | Legacy code, refactoring | clean-code, code-review-checklist | .agent/agents/code-archaeologist.md |
| `explorer-agent` | Analise de codebase | architecture, plan-writing, brainstorming, systematic-debugging | .agent/agents/explorer-agent.md |

---

## CATALOGO DE WORKFLOWS

Procedimentos invocaveis via comando `/comando`:

| Comando | Descricao | Caminho |
|---------|-----------|---------|
| `/brainstorm` | Discovery socratico | .agent/workflows/brainstorm.md |
| `/create` | Criar novas features | .agent/workflows/create.md |
| `/debug` | Debug sistematico | .agent/workflows/debug.md |
| `/deploy` | Deploy de aplicacao | .agent/workflows/deploy.md |
| `/enhance` | Melhorar codigo existente | .agent/workflows/enhance.md |
| `/orchestrate` | Coordenacao multi-agente | .agent/workflows/orchestrate.md |
| `/plan` | Task breakdown | .agent/workflows/plan.md |
| `/preview` | Preview de mudancas | .agent/workflows/preview.md |
| `/status` | Status do projeto | .agent/workflows/status.md |
| `/test` | Executar testes | .agent/workflows/test.md |
| `/ui-ux-pro-max` | Design com 50 estilos | .agent/workflows/ui-ux-pro-max.md |

---

## REGRAS CORE

### Protocolo de Carregamento de Skills

```
Agente ativado -> Check frontmatter "skills:" -> Ler SKILL.md (INDEX) -> Ler secoes especificas
```

- **Leitura Seletiva:** NAO leia TODOS os arquivos de uma skill. Leia `SKILL.md` primeiro, depois apenas as secoes que correspondem ao pedido do usuario.
- **Prioridade de Regras:** P0 (AGENT.md) > P1 (Agent .md) > P2 (SKILL.md). Todas as regras sao vinculantes.

### Checklist de Roteamento de Agente

**ANTES de qualquer resposta de codigo/design:**

| Passo | Verificacao | Se Nao |
|-------|-------------|--------|
| 1 | Identifiquei o agente correto para este dominio? | PARE. Analise o dominio primeiro. |
| 2 | Li o arquivo .md do agente (ou lembro das regras)? | PARE. Abra `.agent/agents/{agente}.md` |
| 3 | Carreguei as skills do frontmatter do agente? | PARE. Verifique o campo `skills:` |

### Roteamento Inteligente (SEMPRE ATIVO)

Antes de responder a QUALQUER request, analise automaticamente e selecione o melhor agente. Protocolo completo em `.agent/skills/intelligent-routing/SKILL.md`.

1. **Analisar (Silencioso)**: Detectar dominios do request
2. **Selecionar Agente(s)**: Escolher o especialista mais apropriado
3. **Informar Usuario**: Indicar qual expertise esta sendo aplicada
4. **Aplicar**: Gerar resposta usando as regras do agente selecionado

### Socratic Gate

**Para requests complexos, PARE e PERGUNTE primeiro:**

| Tipo de Request | Acao |
|----------------|------|
| Nova Feature / Build | Minimo 3 perguntas estrategicas |
| Code Edit / Bug Fix | Confirmar entendimento + perguntar impacto |
| Vago / Simples | Perguntar Proposito, Usuarios, Escopo |
| Orquestracao Completa | PARAR subagentes ate usuario confirmar plano |

### Clean Code (OBRIGATORIO)

TODO codigo DEVE seguir as regras de `.agent/skills/clean-code/SKILL.md`. Sem excecoes.

- **Codigo**: Conciso, direto, sem over-engineering. Auto-documentavel.
- **Testes**: Obrigatorios. Piramide (Unit > Int > E2E) + AAA Pattern.
- **Performance**: Medir primeiro. Core Web Vitals.

### Read -> Understand -> Apply

```
NAO: Ler arquivo do agente -> Comecar a codar
SIM: Ler -> Entender POR QUE -> Aplicar PRINCIPIOS -> Codar
```

### Idioma

- Responder no idioma do usuario
- Codigo, variaveis e comentarios SEMPRE em ingles

---

## SCRIPTS DE VALIDACAO (Opcional)

Scripts Python disponiveis em `.agent/scripts/`:

| Script | Proposito | Quando Usar |
|--------|-----------|-------------|
| `checklist.py` | Auditoria de prioridades (core) | Dev, pre-commit |
| `verify_all.py` | Verificacao completa | Pre-deploy, releases |

**Uso:**
```bash
python .agent/scripts/checklist.py .
python .agent/scripts/verify_all.py . --url http://localhost:3000
```

**Scripts de Skills (em `.agent/skills/<skill>/scripts/`):**

| Script | Skill | Quando |
|--------|-------|--------|
| `security_scan.py` | vulnerability-scanner | Deploy |
| `lint_runner.py` | lint-and-validate | Cada mudanca |
| `test_runner.py` | testing-patterns | Apos logica |
| `schema_validator.py` | database-design | Apos DB change |
| `ux_audit.py` | frontend-design | Apos UI change |
| `accessibility_checker.py` | frontend-design | Apos UI change |
| `seo_checker.py` | seo-fundamentals | Apos page change |
| `bundle_analyzer.py` | performance-profiling | Pre-deploy |
| `mobile_audit.py` | mobile-design | Apos mobile change |
| `lighthouse_audit.py` | performance-profiling | Pre-deploy |
| `playwright_runner.py` | webapp-testing | Pre-deploy |

---

## REFERENCIA RAPIDA

| Preciso de... | Agente | Skills |
|---------------|--------|--------|
| Web App | `frontend-specialist` | nextjs-react-expert, frontend-design |
| API | `backend-specialist` | api-patterns, nodejs-best-practices |
| Mobile | `mobile-developer` | mobile-design |
| Database | `database-architect` | database-design |
| Seguranca | `security-auditor` | vulnerability-scanner |
| Testes | `test-engineer` | testing-patterns, webapp-testing |
| Debug | `debugger` | systematic-debugging |
| Planejamento | `project-planner` | brainstorming, plan-writing |
| Performance | `performance-optimizer` | performance-profiling |
| SEO | `seo-specialist` | seo-fundamentals, geo-fundamentals |
| Deploy | `devops-engineer` | deployment-procedures |
| Game | `game-developer` | game-development |

---

## COMO USAR ESTE SISTEMA

```
1. Copie a pasta .agent/ para dentro do seu projeto
2. No inicio da sessao, a IA le .agent/AGENT.md
3. A IA escaneia o projeto e detecta tecnologias
4. Seleciona automaticamente o agente e skills relevantes
5. Anuncia a selecao ao usuario
6. Para cada request, o intelligent-routing refina a selecao
7. Skills adicionais sao carregadas sob demanda
```

> **Dica:** Voce pode mencionar `@nome-do-agente` para forcar o uso de um agente especifico.
