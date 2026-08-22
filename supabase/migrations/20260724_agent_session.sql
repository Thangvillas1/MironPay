-- Agent Wallet session: user must explicitly approve a time-boxed window
-- before the AI agent can move funds (send/swap/gateway/launchpad).
-- Session expires on its own; no auto-renew.
create table if not exists public.agent_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20,6) not null default 0,
  daily_limit numeric(20,6) not null default 5,
  daily_spent numeric(20,6) not null default 0,
  daily_reset_date date not null default current_date
);
alter table agent_wallets
  add column if not exists session_expires_at timestamptz;
