-- One-time ledger for server-signed Agent commands.
-- A unique nonce makes retries/double-clicks fail before any Circle call.
create table if not exists public.agent_intent_uses (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz not null default now()
);

alter table public.agent_intent_uses enable row level security;

revoke all on table public.agent_intent_uses from anon, authenticated;
grant insert on table public.agent_intent_uses to authenticated;

drop policy if exists "Users consume their own agent intents" on public.agent_intent_uses;
create policy "Users consume their own agent intents"
  on public.agent_intent_uses for insert
  to authenticated
  with check (auth.uid() = user_id and expires_at > now());

create index if not exists agent_intent_uses_expiry_idx
  on public.agent_intent_uses (expires_at);
