-- ============================================================
-- MironPay — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ----------------------------------------------------------------
-- 1. profiles
--    One row per auth user. Created on first OAuth sign-in.
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique,
  pin_hash   text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ----------------------------------------------------------------
-- 2. wallets
--    One wallet per user (unique constraint on user_id).
-- ----------------------------------------------------------------
create table if not exists public.wallets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  balance    numeric(12, 2) default 0,
  currency   text default 'USD',
  created_at timestamptz default now()
);

alter table public.wallets enable row level security;

create policy "Users can read own wallet"
  on public.wallets for select
  using (auth.uid() = user_id);

create policy "Users can insert own wallet"
  on public.wallets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own wallet"
  on public.wallets for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. transactions
--    Ledger entries linked to a wallet.
-- ----------------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid references public.wallets not null,
  type        text not null check (type in ('credit', 'debit')),
  amount      numeric(12, 2) not null,
  description text not null,
  created_at  timestamptz default now()
);

alter table public.transactions enable row level security;

-- Users access their transactions via wallet ownership
create policy "Users can read own transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.wallets
      where wallets.id = transactions.wallet_id
        and wallets.user_id = auth.uid()
    )
  );

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (
    exists (
      select 1 from public.wallets
      where wallets.id = wallet_id
        and wallets.user_id = auth.uid()
    )
  );
