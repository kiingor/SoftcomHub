# Análise UX Completa — SoftcomHub
**Data:** 07 de abril de 2026
**Agente:** UX Agent (Designer de Experiência do Usuário)

---

## 1. Mapa de Problemas UX

| ID | Descrição | Severidade | Heurística Nielsen / Critério WCAG | Impacto no Usuário |
|----|-----------|------------|------------------------------------|--------------------|
| UX-01 | `lang="en"` no HTML com conteúdo 100% em português | Alta | WCAG 3.1.1 (Idioma da Página) | Leitores de tela pronunciam texto em inglês |
| UX-02 | Status online/offline comunicado apenas por cor | Alta | WCAG 1.4.1 (Uso da Cor) | Usuários daltônicos não distinguem estados |
| UX-03 | Indicador de força de senha sem `aria-live` | Alta | WCAG 4.1.3 (Mensagens de Status) | Leitores de tela não recebem feedback |
| UX-04 | Botões com ícones sem `sr-only` consistente | Alta | WCAG 1.1.1 (Conteúdo Não Textual) | Ícones anunciados como "button" sem contexto |
| UX-05 | Inputs de login sem `autoComplete` adequado | Média | WCAG 1.3.5 (Propósito do Input) | Gerenciadores de senha não preenchem automaticamente |
| UX-06 | `loading.tsx` retorna `null` — tela branca | Alta | H#1 Visibilidade do Status do Sistema | Usuário não sabe se sistema está carregando ou travado |
| UX-07 | Erros de fetch silenciosos — `setError` nunca renderizado | Crítica | H#9 Ajudar a Reconhecer e Recuperar Erros | Usuário vê tela vazia sem saber o motivo |
| UX-08 | Reset de senha: `sessionReady=false` sem mensagem | Alta | H#9 Ajudar a Reconhecer e Recuperar Erros | Usuário com link expirado fica em tela branca |
| UX-09 | Skeleton inconsistente entre páginas | Alta | H#1 Visibilidade do Status do Sistema | Usuário não distingue "carregando" de "sem dados" |
| UX-10 | Flash of Wrong Theme (FWOT) | Média | H#4 Consistência e Padrões | Experiência visual perturbadora |
| UX-11 | Inconsistência: glassmorphism no shell vs cards simples nas subpáginas | Alta | H#4 Consistência e Padrões | Sensação de produtos diferentes |
| UX-12 | Emojis hardcoded como ícones de canal | Média | H#4 Consistência e Padrões | Visual amador; emojis variam por OS |
| UX-13 | Duas páginas de login visualmente diferentes mas estruturalmente idênticas | Média | H#4 Consistência e Padrões | Risco de divergência de comportamento |
| UX-14 | Fonte Geist referenciada mas não carregada; Inter com variável ignorada | Baixa | H#4 Consistência e Padrões | Fallback de fonte inesperado |
| UX-15 | Header sem título de página ou breadcrumb | Alta | H#1 Visibilidade do Status do Sistema | Usuário não sabe em qual seção está |
| UX-16 | "Central de Ajuda" na sidebar sem destino | Alta | H#10 Ajuda e Documentação | Cria expectativa falsa; usuário sem suporte |
| UX-17 | Botão de notificações sem `onClick` | Alta | H#1 Visibilidade do Status do Sistema | Quebra confiança no produto |
| UX-18 | Formulários CRUD sem validação client-side | Alta | H#5 Prevenção de Erros | Erro só aparece após round-trip ao servidor |
| UX-19 | Workdesk: ausência de indicadores de estado do ticket | Alta | H#1 Visibilidade do Status do Sistema | Atendente não prioriza corretamente |
| UX-20 | Nenhuma confirmação antes de ações destrutivas | Alta | H#5 Prevenção de Erros | Perda acidental de dados |

---

## 2. Análise por Fluxo Crítico

### Fluxo 1 — Login

**Estado atual:**
```
Acessa /login → campos sem autoComplete → digita credenciais manualmente
→ clica "Entrar"
  [ERRO] → nenhuma mensagem visível
  [OK]   → tela branca (loading null) → flash de tema errado
```

**Problemas:** dois formulários duplicados com risco de divergência; sem estado de loading no botão; sem indicação de qual ambiente; fluxo de reset pode travar em `sessionReady=false` sem mensagem.

**Estado ideal:**
```
Acessa /login → rótulo identifica ambiente → autoComplete ativo
→ validação inline antes do submit
→ botão muda para "Entrando..." e fica desabilitado
  [ERRO] → mensagem contextual inline
  [OK]   → skeleton "Preparando seu painel..." → tema sem flash
→ header exibe nome do usuário como confirmação
```

---

### Fluxo 2 — Atendimento (receber → responder → encerrar)

**Estado atual:**
```
/workdesk → lista com estados visuais inconsistentes
→ clica ticket → tela branca ou tabela vazia
→ envia mensagem → [SE ERRO] silêncio total
→ encerra ticket → sem confirmação → sem feedback
```

**Problemas:** sem diferenciação visual de prioridade/estado; sem confirmação antes de encerrar; sem feedback de sucesso; sem alerta se WebSocket cair.

**Estado ideal:**
```
Lista com badges "Novo/Em Andamento/Aguardando/Crítico" + tempo de espera
→ skeleton durante carregamento da conversa
→ bolha otimista ao enviar → ícone de falha + "Tentar novamente" se erro
→ encerrar → modal de confirmação → toast "Atendimento encerrado" + animação
→ status de conexão WebSocket visível no header
```

---

### Fluxo 3 — Monitoramento (supervisor)

**Estado atual:**
```
/dashboard/monitoramento → atendentes com status só por cor
→ sem título de página → sem breadcrumb
→ notificações inerte → métricas podem falhar silenciosamente
```

**Estado ideal:**
```
Header: "Dashboard > Monitoramento"
Cards no topo: "12 online | 3 em pausa | 8 em atendimento | 2 SLA em risco"
Atendentes: badge textual "Online/Em Pausa/Offline" + cor como reforço + tempo no estado
Notificações: funcional com badge numérico
Erro de fetch: banner "Não foi possível carregar. [Tentar novamente]"
Atualização automática a cada 30s
```

---

## 3. Plano de Melhorias de Acessibilidade

### WCAG 3.1.1 — Idioma da Página
```html
<!-- Antes --> <html lang="en">
<!-- Depois --> <html lang="pt-BR">
```
**Esforço:** 15 min. **Impacto:** Alto.

---

### WCAG 1.4.1 — Status Online/Offline

```tsx
// Antes
<div className="w-2 h-2 rounded-full bg-green-500" />

// Depois — combinar cor + texto
<div className="flex items-center gap-1.5">
  <div className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
  <span className="text-xs text-muted-foreground">Online</span>
</div>
```

---

### WCAG 4.1.3 — Força de Senha

```tsx
const PasswordStrengthIndicator = ({ strength }) => (
  <>
    <div className="flex gap-1 mt-1" aria-hidden="true">
      {/* barras visuais */}
    </div>
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {strength ? `Força da senha: ${strength}` : ''}
    </div>
  </>
);
```

---

### WCAG 1.1.1 — Botões com Ícones

```tsx
// Padrão incorreto
<Button variant="ghost" size="icon">
  <Bell className="h-5 w-5" />
</Button>

// Padrão correto
<Button variant="ghost" size="icon" aria-label="Ver notificações">
  <Bell className="h-5 w-5" aria-hidden="true" />
</Button>
```

**Criar componente `IconButton` que exige `aria-label` obrigatório:**
```tsx
interface IconButtonProps {
  icon: LucideIcon;
  label: string; // obrigatório
  tooltip?: boolean;
}
```

---

### WCAG 1.3.5 — AutoComplete

```tsx
<Input type="email" autoComplete="email" />
<Input type="password" autoComplete="current-password" />
// Para cadastro/reset:
<Input type="password" autoComplete="new-password" />
```

---

### Skip Link

```tsx
// Primeiro elemento focável no layout
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:rounded focus:shadow-lg"
>
  Pular para o conteúdo principal
</a>
```

---

## 4. Quick Wins — Top 5

### QW-1 — Corrigir `lang="pt-BR"` (15 min)
Uma linha de código. Impacto imediato em tecnologia assistiva e SEO.

### QW-2 — Skeleton no Loading (2-3h)
Substituir `return null` por skeleton contextual. Template reutilizável entre páginas.

### QW-3 — Renderizar Erros de Fetch (1-2h/página)
```tsx
{error && (
  <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    <div>
      <p className="font-medium">Erro ao carregar dados</p>
      <p className="text-sm">{error}</p>
      <button onClick={refetch} className="mt-2 text-sm underline">Tentar novamente</button>
    </div>
  </div>
)}
```

### QW-4 — Breadcrumb no Header (1h)
```tsx
const PAGE_TITLES = {
  '/dashboard': 'Visão Geral',
  '/dashboard/monitoramento': 'Monitoramento',
  '/dashboard/metricas': 'Métricas',
  '/dashboard/colaboradores': 'Colaboradores',
  '/dashboard/setores': 'Setores',
  '/dashboard/permissoes': 'Permissões',
};

// No DashboardHeader:
const pathname = usePathname();
const title = PAGE_TITLES[pathname] ?? 'Dashboard';
```

### QW-5 — AutoComplete nos Campos de Login (30 min)
Uma linha por campo. Sem risco de regressão. Impacto imediato para 100% dos usuários com gerenciadores de senha.

---

## 5. Melhorias de Médio Prazo

### MT-1 — Consolidação dos Formulários de Login (1-2 dias)
Criar `<LoginForm>` parametrizável com `role: 'admin' | 'atendente'`. Elimina duplicação e risco de divergência.

### MT-2 — Sistema de Design Unificado (3-5 dias)
Hierarquia visual deliberada:
- **Shell** (sidebar, header, background): glassmorphism
- **Conteúdo** (cards, tabelas, forms): `backdrop-blur` sutil consistente
- **Ações** (modais, toasts): elevação clara

Criar componente `<GlassCard>` central usado por todas as subpáginas.

### MT-3 — Substituição de Emojis por Lucide (1 dia)

| Emoji | Canal | Ícone Lucide |
|-------|-------|--------------|
| 💬 | WhatsApp/Chat | `MessageCircle` |
| 🔗 | Webhook/Link | `Link2` |
| 🎮 | Discord | `Gamepad2` |

### MT-4 — Validação Client-Side em Formulários CRUD (2-3 dias)
Schema Zod centralizado em `lib/schemas/` + `zodResolver`. Erros aparecem no `onBlur`, em português, antes de qualquer requisição ao servidor.

### MT-5 — FWOT — Script de Tema Bloqueante (1 dia)
```tsx
// No <head> do layout, script inline síncrono
<script dangerouslySetInnerHTML={{__html: `
  (function() {
    try {
      var theme = localStorage.getItem('theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.classList.add(theme);
    } catch(e) {}
  })();
`}} />
```

### MT-6 — Estados de Ticket e Feedback no Workdesk (3-4 dias)
- Badges de estado com cor + texto
- Otimistic updates no chat
- Indicador de reconexão WebSocket
- Modal de confirmação antes de encerrar
- Toast após ações

---

## 6. Sugestões de Redesign

### Header do Dashboard
Breadcrumb clicável esquerda + avatar com dropdown direita. Botão de notificações com badge numérico abre painel lateral (não modal). "Central de Ajuda" move para rodapé da sidebar com link real.

### Lista de Tickets no Workdesk
Badge estado (cor + texto) + nome cliente + canal como ícone com tooltip + preview última mensagem truncado + tempo decorrido (verde→amarelo→vermelho). Borda esquerda vermelha para SLA em risco. Hover revela ações rápidas "Assumir" e "Transferir".

### Indicador de Status de Atendente
`[Ícone] [Texto]` — ex: `● Online`, `◌ Em Pausa`, `○ Offline`. Tooltip com "Online há 3h20min — 4 tickets ativos". `aria-label="Status: Online"` para leitores de tela.

### Reset de Senha com Link Expirado
Após 3s sem `sessionReady`, exibir:
- Ícone `LinkOff`
- Título: "Este link de redefinição expirou"
- Descrição: "Links são válidos por 24h. Solicite um novo link abaixo."
- Botão primário: "Solicitar novo link"
- Link secundário: "Voltar para o login"

---

## 7. Checklist de QA de UX

### Acessibilidade
- [ ] `<html lang="pt-BR">` presente no documento raiz
- [ ] Todos os botões com ícone têm `aria-label` descritivo em português
- [ ] Ícones decorativos têm `aria-hidden="true"`
- [ ] Status comunicados por cor também têm texto ou `sr-only`
- [ ] `aria-live="polite"` em regiões que mudam dinamicamente
- [ ] Todos os inputs têm `label` associado (não apenas placeholder)
- [ ] Inputs de autenticação têm `autoComplete` adequado
- [ ] Tab percorre todos os elementos interativos na ordem lógica
- [ ] Focus visible claramente visível (testar sem mouse)
- [ ] Modais têm focus trap ativo
- [ ] Skip link presente e funcional
- [ ] Contraste WCAG AA (4.5:1 para texto normal)
- [ ] Testar com VoiceOver ou NVDA

### Estados e Feedback
- [ ] Todas as páginas têm estado de loading visível — sem tela branca
- [ ] Erros de fetch renderizados com mensagem + retry
- [ ] Botões de submit ficam desabilitados durante loading
- [ ] Ações destrutivas têm modal de confirmação
- [ ] Ações bem-sucedidas têm toast de confirmação
- [ ] Formulários com dados não salvos avisam ao tentar fechar
- [ ] Estado vazio tem mensagem explicativa e call-to-action
- [ ] Erros de validação inline por campo, em português, no `onBlur`

### Consistência Visual
- [ ] Tema escuro e claro: testar ambos
- [ ] Sem FWOT ao abrir pela primeira vez
- [ ] Fonte correta sendo aplicada (DevTools > Computed > font-family)
- [ ] Ícones usam Lucide — nenhum emoji como ícone funcional
- [ ] Visual consistente entre shell e subpáginas
- [ ] Responsividade: testar em 1280px, 1440px, 375px

### Navegação e Orientação
- [ ] Header exibe título/breadcrumb correto em todas as subpáginas
- [ ] `aria-current="page"` no item ativo da sidebar
- [ ] Todos os links têm destino funcional — nenhum elemento inerte
- [ ] Botão de notificações funcional ou removido
- [ ] "Central de Ajuda" tem href funcional ou removido
- [ ] `<h1>` presente e único em cada página

---

## Resumo de Prioridades

| Prioridade | Item | Esforço | Impacto |
|------------|------|---------|---------|
| P0 — Imediato | UX-07: Erros silenciosos | Baixo | Crítico |
| P0 — Imediato | UX-01: `lang="pt-BR"` | Mínimo | Alto |
| P0 — Imediato | UX-06: loading null | Baixo | Alto |
| P1 — Sprint | UX-15: Breadcrumb/título | Baixo | Alto |
| P1 — Sprint | UX-02: Status com texto | Baixo | Alto |
| P1 — Sprint | UX-05: autoComplete | Mínimo | Médio |
| P1 — Sprint | UX-03: aria-live senha | Baixo | Alto |
| P2 — Backlog | UX-11: Consistência visual | Médio | Alto |
| P2 — Backlog | UX-18: Validação client-side | Médio | Alto |
| P2 — Backlog | UX-12: Emojis → Lucide | Baixo | Médio |
| P3 — Roadmap | UX-19: Estados de ticket | Alto | Alto |
| P3 — Roadmap | UX-20: Confirmação destrutivas | Médio | Alto |
