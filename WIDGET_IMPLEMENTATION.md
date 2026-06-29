# Chat Widget - Documentação de Implementação

## 🎯 O que foi implementado

Sistema completo de chat widget com as seguintes funcionalidades:

1. **Autenticação por Telefone** — Busca/cria cliente por telefone, com suporte a CNPJ e nome
2. **Seleção de Setor** — Widget mostra apenas setores configurados para cada instância
3. **Chat em Tempo Real** — Mensagens síncronas via Supabase Realtime
4. **Persistência de Sessão** — Token JWT 24h salvo em localStorage
5. **Histórico de Mensagens** — Busca com paginação
6. **Embed em Sites** — Script de embedagem como iframe responsivo

---

## 📁 Arquivos Criados

### Database (Migrações)
- `supabase/migrations/20260625_widget_configs.sql` — Schema de widget_configs, widget_sector_mapping

### Backend APIs
- `app/api/widget/auth/route.ts` — POST autenticação (CNPJ, nome, telefone)
- `app/api/widget/setores/route.ts` — GET lista de setores do widget
- `app/api/widget/tickets/criar/route.ts` — POST criação automática de ticket
- `app/api/widget/messages/route.ts` — POST enviar mensagem
- `app/api/widget/messages/[ticketId]/route.ts` — GET histórico de mensagens

### Services
- `lib/services/cliente-widget-upsert.ts` — Lógica de busca/criação de cliente por telefone
- `lib/supabase.ts` — Funções de criação de Supabase clients

### Frontend Widget
- `components/widget/WidgetRoot.tsx` — Container principal (gerencia telas)
- `components/widget/SectorSelector.tsx` — Tela 1: Lista de setores
- `components/widget/AuthForm.tsx` — Tela 2: Autenticação (CNPJ, nome, telefone)
- `components/widget/ChatContainer.tsx` — Tela 3: Chat com realtime
- `components/widget/MessageBubble.tsx` — Renderização de mensagens
- `components/widget/InputArea.tsx` — Área de input com auto-grow

### Página do Widget
- `app/widget/chat/page.tsx` — Página standalone para iframe

### Script de Embed
- `public/embed-widget.js` — Script que clientes usam para embedar widget em seus sites

---

## 🚀 Como Usar

### 1. Deploy/Executar Migrações

```bash
# No Supabase Studio, executar:
# SQL Editor → copiar conteúdo de supabase/migrations/20260625_widget_configs.sql
```

### 2. Criar Widget Instance

Via dashboard admin (TODO implementar):
```
POST /api/painel/widgets
{
  "nome": "Widget Suporte",
  "descricao": "Chat para suporte técnico",
  "allowed_domains": ["seu-site.com", "www.seu-site.com"],
  "max_queue_size": 100
}
```

Response:
```json
{
  "id": "uuid",
  "api_key": "sk_widget_abc123xyz",
  "nome": "Widget Suporte"
}
```

### 3. Configurar Setores do Widget

Via dashboard (TODO):
```
POST /api/painel/widgets/{widget_id}/sector-mapping
{
  "setor_id": "uuid-suporte",
  "display_order": 1,
  "setor_transbordo_id": "uuid-ouvidoria"
}
```

### 4. Embedar em Site

No HTML do cliente (ex: seu-site.com):

```html
<div id="softcom-widget"></div>
<script src="https://seu-dominio.com/embed-widget.js?key=sk_widget_abc123xyz"></script>
```

Resultado: Widget aparece como iframe 600px de altura, responsivo.

---

## 🔄 Fluxo de Dados

```
1. Usuário abre página com widget
   ↓
2. Script embed carrega iframe: /widget/chat?key=sk_widget_xxx
   ↓
3. Widget mostra dropdown: GET /api/widget/setores?widget_key=sk_widget_xxx
   ↓
4. Usuário seleciona "Suporte"
   ↓
5. Autentica: POST /api/widget/auth
   ├─ clienteWidgetUpsert: busca por telefone
   │  ├─ encontrado: retorna cliente_id
   │  ├─ não encontrado: cria novo cliente
   │  └─ sem CNPJ + você passou: atualiza CNPJ
   ├─ Retorna JWT token (24h)
   ↓
6. POST /api/widget/tickets/criar
   ├─ Cria ticket automático
   ├─ Tenta atribuir atendente (ou deixa em fila)
   ↓
7. Widget abre chat
   ├─ GET /api/widget/messages/{ticketId} — carrega histórico
   ├─ Supabase realtime subscribe() — escuta novos INSERTs
   ↓
8. Usuário digita + envia
   ├─ POST /api/widget/messages
   ├─ Salva na tabela `mensagens` (remetente: 'cliente-widget')
   ├─ Realtime notifica atendente
   ├─ notifyAtendenteNovaMensagem() envia push
   ↓
9. Atendente responde via WorkDesk
   ├─ Mensagem salva com remetente: 'colaborador'
   ├─ Realtime notifica widget
   ├─ Widget renderiza em tempo real (sem reload)
```

---

## 🔐 Segurança

### Autenticação
- JWT assinado com `NEXTAUTH_SECRET`
- Válido por 24h
- Renovação no localStorage automaticamente

### Autorização
- Cada request valida JWT (Authorization: Bearer token)
- Cliente só vê mensagens do seu ticket
- RLS policies no Supabase isolam por cliente_id

### Validação de Entrada
- CNPJ: 14 dígitos + verificadores (mod 11)
- Telefone: 10-15 dígitos
- Nome: max 255 chars, sem SQL injection

---

## 📊 Estrutura de Dados

### widget_configs
```
id (uuid)
api_key (unique) — sk_widget_xxx
nome (text)
descricao (text)
allowed_domains (text[]) — CORS whitelist
max_queue_size (int, nullable)
created_at, updated_at, deleted_at
```

### widget_sector_mapping
```
id (uuid)
widget_id (uuid) → widget_configs
setor_id (uuid) → setores
display_order (int)
setor_transbordo_id (uuid, nullable) → setores
created_at
```

### Extensões
- `setores.widget_visible` (bool) — setor visível em widgets?
- `tickets.widget_id` (uuid, nullable) — qual widget criou ticket

---

## 🧪 Testes Manuais

### 1. Criar Widget no Banco (SQL direto)

```sql
INSERT INTO widget_configs (api_key, nome, allowed_domains)
VALUES ('sk_widget_test123', 'Test Widget', ARRAY['localhost:3000', '127.0.0.1:3000']);

-- Copiar o ID gerado (uuid)

INSERT INTO widget_sector_mapping (widget_id, setor_id, display_order)
SELECT 
  (SELECT id FROM widget_configs WHERE api_key = 'sk_widget_test123'),
  id,
  ROW_NUMBER() OVER (ORDER BY created_at)
FROM setores
WHERE widget_visible = true
LIMIT 3;
```

### 2. Testar Widget Localmente

```bash
npm run dev
```

Abrir: `http://localhost:3000/widget/chat?key=sk_widget_test123`

### 3. Teste de Fluxo

1. Seleciona setor
2. Preenche: Nome, Telefone, CNPJ
3. Clica "Continuar" → verifica POST /api/widget/auth
4. Carrega chat → verifica GET /api/widget/messages
5. Digita mensagem → verifica POST /api/widget/messages
6. Atendente responde no WorkDesk → realtime mostra em tempo real

---

## 🎨 Customização

### CSS/Styling
- Componentes usam Tailwind + shadcn/ui
- Cores herdam da aplicação main (--primary, etc)
- Responsivo: desktop (600px), mobile (500px)

### Comportamento
- Mensagens auto-scroll para bottom
- Textarea auto-grow até 5 linhas
- Enter = enviar, Shift+Enter = nova linha

---

## 📋 Próximas Fases

### Fase 2: Admin Dashboard
- [ ] CRUD de widgets (`/painel/widgets`)
- [ ] Configurar setores por widget
- [ ] Gerar embed script automaticamente
- [ ] Analytics (tickets via widget, taxa de resposta)

### Fase 3: Features Avançadas
- [ ] Upload de imagem/documento
- [ ] Emojis
- [ ] Feedback pós-chat (avaliação)
- [ ] Notificações web push quando resposta chega

### Fase 4: Desktop
- [ ] Electron app wrapper
- [ ] Notifications nativas
- [ ] Offline queue

---

## 🐛 Troubleshooting

### Widget não aparece
- [ ] Verificar `allowed_domains` em widget_configs
- [ ] Verificar origin header (browser console)
- [ ] Verificar CORS headers em middleware

### Mensagem não chega
- [ ] Verificar ticket foi criado (SELECT * FROM tickets WHERE widget_id = ...)
- [ ] Verificar realtime está conectado (browser devtools → Network)
- [ ] Verificar token JWT é válido

### Cliente não encontrado
- [ ] Verificar telefone está normalizado (sem máscara)
- [ ] Verificar cliente existe em `clientes` table
- [ ] Verificar não há duplicatas de telefone

---

## 📚 Referências

- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Web Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- JWT (jose): https://github.com/panva/jose
