-- WalletConnect: audit log of every dapp request the wallet answered.
-- One row per sign / send, written by the backend (service role only) after
-- the user approved it with their PIN — or after the backend refused it.
create table if not exists public.wc_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  wallet_address text not null,
  dapp_name     text,
  dapp_url      text,
  dapp_verified text,              -- WalletConnect Verify: VALID / UNKNOWN / INVALID
  method        text not null,     -- personal_sign / eth_signTypedData_v4 / eth_sendTransaction
  summary       jsonb,             -- decoded request (to, value, selector, typed-data primaryType…)
  status        text not null check (status in ('signed', 'sent', 'refused', 'failed')),
  result        text,              -- signature or tx hash
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists wc_requests_user_time_idx on public.wc_requests (user_id, created_at desc);

alter table public.wc_requests enable row level security;
-- Users may read their own history (Profile → Connected apps); only the
-- backend writes.
create policy "Users read own wc requests"
  on public.wc_requests for select
  using (auth.uid() = user_id);
