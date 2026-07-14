-- Tags a tx_hash with a semantic kind ("swap" for now) so the transaction
-- list can distinguish a real on-chain swap (Circle only reports a generic
-- Sent/Received) from a plain transfer, without inferring it from
-- description text. Same RLS shape as transaction_memos.
create table if not exists public.transaction_kinds (
  tx_hash        text primary key,
  kind           text not null,
  wallet_address text not null,
  created_at     timestamptz default now()
);

alter table public.transaction_kinds enable row level security;

create policy "Wallet owner can read kinds"
  on public.transaction_kinds for select
  using (
    wallet_address = (select wallet_address from public.profiles where id = auth.uid())
    or wallet_address = (select agent_wallet_address from public.profiles where id = auth.uid())
  );

create policy "Wallet owner can insert kinds"
  on public.transaction_kinds for insert
  with check (
    wallet_address = (select wallet_address from public.profiles where id = auth.uid())
    or wallet_address = (select agent_wallet_address from public.profiles where id = auth.uid())
  );
