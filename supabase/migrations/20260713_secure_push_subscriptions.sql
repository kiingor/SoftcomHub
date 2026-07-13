-- Web Push subscriptions contain private device endpoints and encryption keys.
-- They are accessed only by authenticated server routes using the service role.
alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
