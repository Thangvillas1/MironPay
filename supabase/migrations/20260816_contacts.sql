create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  handle          text check (handle is null or char_length(handle) <= 80),
  wallet_address  text not null check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  favorite        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_user_id, wallet_address)
);

alter table public.contacts enable row level security;

create policy "Users can read own contacts"
  on public.contacts for select using (auth.uid() = owner_user_id);
create policy "Users can create own contacts"
  on public.contacts for insert with check (auth.uid() = owner_user_id);
create policy "Users can update own contacts"
  on public.contacts for update
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "Users can delete own contacts"
  on public.contacts for delete using (auth.uid() = owner_user_id);

create index if not exists contacts_owner_user_id_idx
  on public.contacts (owner_user_id, favorite desc, name);
