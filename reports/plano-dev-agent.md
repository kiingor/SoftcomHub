# Plano Técnico Completo de Melhorias — SoftcomHub
**Data:** 07 de abril de 2026
**Agente:** DEV Agent (Desenvolvedor Sênior Full Stack)

---

## 1. Inventário de Débito Técnico

| ID | Arquivo | Problema | Severidade | Impacto | Esforço |
|----|---------|----------|------------|---------|---------|
| DT-01 | `next.config.mjs` | `typescript: { ignoreBuildErrors: true }` — erros de tipo passam silenciosamente para produção | Crítico | Bugs em runtime, falsos negativos no CI | P |
| DT-02 | `next.config.mjs` | `images: { unoptimized: true }` — desativa otimização de imagem globalmente | Alto | Performance degradada, LCP pior | P |
| DT-03 | `app/*/page.tsx` (múltiplos) | `createClient()` instanciado no escopo do módulo, fora do componente/handler | Crítico | Vazamento de contexto entre requests, bugs com HMR | M |
| DT-04 | `app/loading.tsx` | Retorna `null` — sem feedback visual durante navegação | Crítico | UX quebrada, tela branca | P |
| DT-05 | Múltiplos componentes | `setError` declarado mas nunca renderizado — erros silenciosos | Crítico | Usuário sem feedback de falha | M |
| DT-06 | `app/layout.tsx` | `ThemeProvider` não montado | Crítico | Flash de tema (FOUC) em toda troca de rota | P |
| DT-07 | `hooks/use-toast.ts` + `components/ui/use-toast.ts` | Hook `use-toast` duplicado | Alto | Divergência de estado, comportamento imprevisível | P |
| DT-08 | `hooks/use-mobile.ts` + `components/ui/use-mobile.ts` | Hook `use-mobile` duplicado | Médio | Manutenção duplicada, risco de divergência | P |
| DT-09 | `app/dashboard/page.tsx` + `app/setor/[id]/page.tsx` | Constante `AVAILABLE_ICONS` duplicada | Médio | Inconsistência futura, manutenção dobrada | P |
| DT-10 | Múltiplos componentes | 2 sistemas de toast simultâneos: `use-toast` (shadcn) e `sonner` | Alto | Comportamento inconsistente, bundle inchado | M |
| DT-11 | `app/login/page.tsx` + `app/workdesk/login/page.tsx` | Páginas de login duplicadas (copy-paste com cores) | Alto | Divergência de features, bug corrigido em um não propagado | M |
| DT-12 | `styles/globals.css` | Duplicata de `app/globals.css` | Médio | Confusão de qual é a fonte da verdade, estilos conflitantes | P |
| DT-13 | Formulários gerais | Zod + react-hook-form subutilizados | Alto | Erros só aparecem após round-trip ao servidor | G |
| DT-14 | Páginas de login | `<img>` em vez de `<Image>` do Next.js | Médio | Sem lazy load, sem otimização de formato/tamanho | P |
| DT-15 | Múltiplos arquivos | Emojis hardcoded (`icon: '💬'`) em vez de Lucide | Baixo | Inacessibilidade, inconsistência visual | P |
| DT-16 | `app/layout.tsx` / CSS global | Fonte Geist referenciada mas não carregada; `_inter` com underscore ignorada | Alto | Fonte incorreta renderizada, possível FOUF | P |
| DT-17 | `lib/supabase/client.ts`, `proxy.ts` | `process.env.NEXT_PUBLIC_SUPABASE_URL!` sem validação | Alto | Crash em runtime se env ausente, sem mensagem de erro útil | P |
| DT-18 | `/scripts/*.sql` (50+ arquivos) | Scripts SQL históricos sem sistema de migration formal | Alto | Sem rastreabilidade, ambiente inconsistente | G |
| DT-19 | `README.md` | Praticamente vazio | Baixo | Onboarding lento para novos devs | M |
| DT-20 | `app/dashboard/` (múltiplas subpáginas) | Ausência de Error Boundaries | Alto | Crash de um componente derruba toda a página | M |

---

## 2. Top 5 Problemas Críticos — Before/After

### DT-01 — TypeScript ignorando erros de build

**Before:**
```js
// next.config.mjs
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};
```

**After:**
```js
// next.config.mjs
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
```

**Ação:** após remover a flag, rodar `npx tsc --noEmit` e corrigir todos os erros expostos.

---

### DT-03 — `createClient()` no escopo do módulo

**Before:**
```ts
// Topo do arquivo, fora de qualquer função
const supabase = createClient(); // ← PROBLEMA: escopo de módulo

export default async function DashboardPage() {
  const { data } = await supabase.from('tickets').select('*');
}
```

**After:**
```ts
export default async function DashboardPage() {
  const supabase = await createClient(); // ← CORRETO: dentro do componente
  const { data } = await supabase.from('tickets').select('*');
}
```

---

### DT-04 — `loading.tsx` retornando `null`

**Before:**
```tsx
// app/loading.tsx
export default function Loading() {
  return null;
}
```

**After:**
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6 w-full animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 border-b last:border-0">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### DT-06 — ThemeProvider não montado

**Before:**
```tsx
// app/layout.tsx
const _inter = Inter({ subsets: ['latin'] }); // underscore → ignorado

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body> // ThemeProvider ausente
    </html>
  );
}
```

**After:**
```tsx
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.variable}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

### DT-05 + DT-13 — Erros silenciosos e validação fraca

**Before:**
```tsx
const [error, setError] = useState<string | null>(null);

async function handleSubmit(e) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setError(error.message); // nunca renderizado!
}

return (
  <form onSubmit={handleSubmit}>
    <input type="email" value={email} />
    <input type="password" value={password} />
    <button type="submit">Entrar</button>
    {/* ESQUECIDO: {error && <p>{error}</p>} */}
  </form>
);
```

**After — com Zod + react-hook-form:**
```ts
// lib/schemas/auth.ts
export const loginSchema = z.object({
  email: z.string().min(1, 'E-mail obrigatório').email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
});
```

```tsx
// components/auth/LoginForm.tsx
export function LoginForm({ redirectTo }) {
  const form = useForm({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) {
      toast.error('Falha no login', { description: error.message });
      return;
    }
    router.push(redirectTo);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>E-mail</FormLabel>
            <FormControl><Input type="email" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField name="password" render={({ field }) => (
          <FormItem>
            <FormLabel>Senha</FormLabel>
            <FormControl><Input type="password" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </Form>
  );
}
```

---

## 3. Plano de Refatoração — Sequência com Dependências

```
FASE 0 — Foundation (sem dependências, máximo ROI)
├── [F0-1] Remover ignoreBuildErrors + unoptimized (next.config.mjs)
├── [F0-2] Corrigir todos os erros TypeScript (tsc --noEmit)
├── [F0-3] Fixar loading.tsx com skeleton real
├── [F0-4] Fixar ThemeProvider + fonte Inter no layout.tsx
└── [F0-5] Validar variáveis de ambiente na inicialização

FASE 1 — Consolidação de infraestrutura
├── [F1-1] Criar lib/env.ts — validação centralizada de envs com Zod
├── [F1-2] Unificar clientes Supabase
├── [F1-3] Unificar sistema de toast — remover use-toast, manter sonner
├── [F1-4] Deletar hooks/use-toast.ts (duplicata)
└── [F1-5] Deletar styles/globals.css, consolidar em app/globals.css

FASE 2 — Componentes compartilhados
├── [F2-1] Criar components/auth/AuthLayout.tsx com prop variant
├── [F2-2] Criar components/auth/LoginForm.tsx com Zod + react-hook-form
├── [F2-3] Refatorar ambas as páginas de login usando AuthLayout + LoginForm
├── [F2-4] Extrair AVAILABLE_ICONS para lib/constants/icons.ts
└── [F2-5] Substituir <img> por <Image>

FASE 3 — Tratamento de erro e UX
├── [F3-1] Adicionar Error Boundaries em dashboard e workdesk
├── [F3-2] Auditar todos os setError() sem JSX e corrigir
├── [F3-3] Criar loading.tsx específicos por rota
└── [F3-4] Substituir emojis hardcoded por ícones Lucide

FASE 4 — Qualidade de formulários
├── [F4-1] Criar schemas Zod em lib/schemas/
├── [F4-2] Migrar formulários de alto tráfego para react-hook-form
└── [F4-3] Adicionar loading states nos botões de submit

FASE 5 — Migrations e infraestrutura de dados
├── [F5-1] Inicializar supabase/migrations/ via CLI
├── [F5-2] Converter scripts SQL históricos em migrations numeradas
├── [F5-3] Testar reset completo: supabase db reset
└── [F5-4] Adicionar supabase db push ao CI/CD

FASE 6 — Testes
```

---

## 4. Melhorias de Arquitetura

### 4.1 Validação centralizada de variáveis de ambiente

```ts
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('Variáveis de ambiente inválidas:', _parsed.error.flatten().fieldErrors);
  throw new Error('Configuração de ambiente inválida.');
}

export const env = _parsed.data;
```

### 4.2 AuthLayout compartilhado

```tsx
// components/auth/AuthLayout.tsx
const VARIANTS = {
  admin: { title: 'Painel Administrativo', accentClass: 'bg-primary' },
  workdesk: { title: 'Mesa de Atendimento', accentClass: 'bg-emerald-600' },
};

export function AuthLayout({ variant, children }) {
  const config = VARIANTS[variant];
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className={`hidden lg:flex flex-col p-10 text-white ${config.accentClass}`}>
        <h1 className="text-3xl font-bold">{config.title}</h1>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
```

### 4.3 Sistema de Toast Único (sonner)

```ts
// Antes (2 sistemas):
import { useToast } from '@/hooks/use-toast';
const { toast } = useToast();
toast({ title: 'Erro', description: msg });

// Depois (1 sistema):
import { toast } from 'sonner';
toast.error('Erro', { description: msg });
toast.success('Sucesso', { description: msg });
```

Passos:
1. `grep -r "use-toast"` — mapear todos os usos
2. Substituir um a um por `import { toast } from 'sonner'`
3. Deletar `hooks/use-toast.ts` e `components/ui/use-toast.ts`
4. Remover `<Toaster>` do shadcn, manter apenas o do sonner no `layout.tsx`

---

## 5. Melhorias de Performance

### 5.1 Next.js Image

```tsx
// Before
<img src="/logo.svg" alt="Logo" className="h-10" />

// After
import Image from 'next/image';
<Image src="/logo.svg" alt="Logo" width={120} height={40} priority />
```

### 5.2 Code Splitting para componentes pesados

```tsx
import dynamic from 'next/dynamic';

const RealtimeChart = dynamic(
  () => import('@/components/dashboard/RealtimeChart'),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
```

### 5.3 SWR Config Global

```tsx
<SWRConfig value={{
  revalidateOnFocus: false,
  dedupingInterval: 5000,
  errorRetryCount: 3,
  onError: (error) => {
    if (error.status !== 403 && error.status !== 404) {
      toast.error('Erro ao carregar dados', { description: error.message });
    }
  },
}}>
  {children}
</SWRConfig>
```

### 5.4 Cleanup de Subscriptions Realtime

```tsx
// Padrão CORRETO — com cleanup obrigatório
useEffect(() => {
  const channel = supabase
    .channel('tickets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, handler)
    .subscribe();

  return () => { supabase.removeChannel(channel); }; // ← crítico
}, []);
```

---

## 6. Plano de Testes

### Setup

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom
pnpm add -D @playwright/test
```

### O que testar — Alta prioridade

```ts
// tests/lib/schemas/auth.test.ts
describe('loginSchema', () => {
  it('valida e-mail inválido', () => {
    const result = loginSchema.safeParse({ email: 'invalido', password: '123456' });
    expect(result.success).toBe(false);
  });
  it('rejeita senha curta', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '123' });
    expect(result.success).toBe(false);
  });
});
```

```ts
// tests/e2e/auth.spec.ts
test('login admin redireciona para dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL!);
  await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

### Cobertura mínima recomendada

| Camada | Meta |
|--------|------|
| Schemas Zod (`lib/schemas/`) | 100% |
| Hooks customizados | 80% |
| Componentes críticos (forms, auth) | 70% |
| Fluxos E2E (login, atendimento) | Todos os happy paths |

---

## 7. Checklist de Implementação — Do Mais Urgente ao Menos Urgente

```
SEMANA 1 — Estabilidade crítica
[ ] Remover typescript.ignoreBuildErrors de next.config.mjs
[ ] Rodar tsc --noEmit e corrigir todos os erros expostos
[ ] Remover images.unoptimized de next.config.mjs
[ ] Montar ThemeProvider no app/layout.tsx
[ ] Corrigir nome da variável de fonte (remover underscore de _inter)
[ ] Remover referência à fonte Geist não carregada do CSS
[ ] Implementar loading.tsx com skeleton real
[ ] Mover createClient() para dentro dos handlers

SEMANA 2 — Consolidação e duplicatas
[ ] Criar lib/env.ts com validação Zod de variáveis de ambiente
[ ] Unificar para sonner — remover use-toast shadcn completamente
[ ] Deletar hooks/use-toast.ts (duplicata)
[ ] Deletar components/ui/use-mobile.ts (duplicata)
[ ] Deletar styles/globals.css (duplicata de app/globals.css)
[ ] Extrair AVAILABLE_ICONS para lib/constants/icons.ts
[ ] Auditar todos os setError() sem JSX e renderizar os erros

SEMANA 3 — Componentes compartilhados e UX
[ ] Criar components/auth/AuthLayout.tsx
[ ] Criar components/auth/LoginForm.tsx com Zod + react-hook-form
[ ] Refatorar ambas as páginas de login
[ ] Substituir <img> por <Image> nas páginas de login
[ ] Adicionar Error Boundary em app/dashboard/layout.tsx e app/workdesk/layout.tsx

SEMANA 4 — Qualidade de formulários
[ ] Criar lib/schemas/ com schemas Zod por entidade
[ ] Migrar formulário de criação de ticket
[ ] Migrar demais formulários de alto tráfego
[ ] Substituir emojis hardcoded por ícones Lucide

SEMANA 5 — Infraestrutura de dados
[ ] Inicializar supabase/migrations/ via CLI
[ ] Converter scripts SQL históricos em migrations ordenadas
[ ] Testar supabase db reset do zero
[ ] Adicionar supabase db push ao CI/CD

SEMANA 6+ — Testes e documentação
[ ] Instalar Vitest + Testing Library + Playwright
[ ] Adicionar testes unitários para schemas Zod
[ ] Adicionar testes de integração para LoginForm
[ ] Adicionar E2E tests para fluxo de login e atendimento
[ ] Escrever README.md com setup, envs, migrations, arquitetura
[ ] Configurar SWRConfig global com onError
[ ] Auditar useEffects com Realtime — garantir cleanup
[ ] Implementar dynamic imports para Recharts e Framer Motion
```

---

## Resumo Executivo

O SoftcomHub tem uma stack moderna e bem escolhida, mas acumulou débito técnico em camadas de configuração, duplicação e ausência de padronização. Os problemas mais graves (TypeScript ignorado, createClient fora de contexto, loading nulo, ThemeProvider desconectado) são todos corrigíveis em menos de uma semana sem risco de regressão. A eliminação de duplicatas reduz a superfície de manutenção pela metade. A adoção completa de Zod + react-hook-form e a formalização das migrations SQL são as mudanças com maior impacto de longo prazo.
