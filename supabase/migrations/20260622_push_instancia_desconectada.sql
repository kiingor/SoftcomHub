-- Web Push: notificação de instância (Evolution) desconectada
-- Rodar no Supabase Studio (SQL Editor). Banco é compartilhado prod/dev —
-- as mudanças valem para os dois imediatamente. Tudo idempotente.

-- 1) Subscriptions de Web Push, uma por dispositivo/navegador do colaborador
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_colaborador
  on public.push_subscriptions(colaborador_id);

-- 2) Último estado de conexão por canal — o cron compara contra o estado atual
--    da Evolution pra detectar a transição conectado -> desconectado.
alter table public.setor_canais
  add column if not exists last_connection_state  text,
  add column if not exists last_state_changed_at  timestamptz;
