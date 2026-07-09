-- ============================================================
-- MironPay — Lucky Pool (Chat-to-Earn Jackpot)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Global pool tracker (single row, id always = 1)
create table if not exists public.lucky_pool (
  id                  int primary key default 1,
  balance             numeric(12, 6) default 0,
  total_contributed   numeric(12, 6) default 0,
  total_won           numeric(12, 6) default 0,
  updated_at          timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into public.lucky_pool (id, balance, total_contributed, total_won)
values (1, 50, 0, 0)
on conflict (id) do nothing;

-- Win history
create table if not exists public.lucky_wins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  username    text,
  amount      numeric(12, 6) not null,
  msg_streak  int default 0,
  created_at  timestamptz default now()
);

alter table public.lucky_pool   enable row level security;
alter table public.lucky_wins   enable row level security;

create policy "Anyone can read pool"    on public.lucky_pool for select using (true);
create policy "Service can update pool" on public.lucky_pool for update using (true);

create policy "Anyone can read wins"    on public.lucky_wins for select using (true);
create policy "Service can insert wins" on public.lucky_wins for insert with check (true);
