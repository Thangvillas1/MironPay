-- ============================================================
-- MironPay — Payroll v0
-- Run this in: Supabase Dashboard → SQL Editor
-- No multi-tenant "company" concept exists yet — the signed-in
-- user IS the payer. Every table below is scoped by user_id,
-- mirroring 001_initial_schema.sql's RLS pattern.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. payroll_employees
--    Wallet address is entered once here and confirmed by the
--    payer — monthly pay-run files never carry a wallet column.
--    Employees are never deleted, only deactivated (is_active).
-- ----------------------------------------------------------------
create table if not exists public.payroll_employees (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  employee_id    text not null,
  name           text not null,
  wallet_address text not null,
  is_active      boolean not null default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, employee_id)
);

alter table public.payroll_employees enable row level security;

create policy "Users can read own payroll employees"
  on public.payroll_employees for select
  using (auth.uid() = user_id);

create policy "Users can insert own payroll employees"
  on public.payroll_employees for insert
  with check (auth.uid() = user_id);

create policy "Users can update own payroll employees"
  on public.payroll_employees for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 2. payroll_employee_wallet_changes
--    Audit log. A wallet-address change is always a distinct,
--    logged action — never a silent field edit.
-- ----------------------------------------------------------------
create table if not exists public.payroll_employee_wallet_changes (
  id              uuid primary key default gen_random_uuid(),
  employee_row_id uuid references public.payroll_employees not null,
  user_id         uuid references auth.users not null,
  old_wallet      text not null,
  new_wallet      text not null,
  changed_at      timestamptz default now()
);

alter table public.payroll_employee_wallet_changes enable row level security;

create policy "Users can read own wallet change log"
  on public.payroll_employee_wallet_changes for select
  using (auth.uid() = user_id);

create policy "Users can insert own wallet change log"
  on public.payroll_employee_wallet_changes for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 3. payroll_runs
--    draft_rows / draft_errors hold parsed-CSV staging state.
--    payroll_run_items (below) are only created at Approve time —
--    that act of re-querying payroll_employees fresh IS the
--    snapshot-freeze, so no extra "snapshotted" flag is needed.
-- ----------------------------------------------------------------
create table if not exists public.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  period         text not null,
  status         text not null default 'draft'
                   check (status in ('draft', 'approved', 'processing', 'paid', 'partially_paid', 'cancelled')),
  file_hash      text,
  total_amount   numeric(20, 6) not null default 0,
  employee_count int not null default 0,
  draft_rows     jsonb not null default '[]'::jsonb,
  draft_errors   jsonb not null default '[]'::jsonb,
  created_at     timestamptz default now(),
  approved_at    timestamptz,
  paid_at        timestamptz
);

alter table public.payroll_runs enable row level security;

create policy "Users can read own payroll runs"
  on public.payroll_runs for select
  using (auth.uid() = user_id);

create policy "Users can insert own payroll runs"
  on public.payroll_runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own payroll runs"
  on public.payroll_runs for update
  using (auth.uid() = user_id);

-- Only one OPEN run per period — a cancelled run must not block
-- retrying that period, so this is a partial index, not a plain
-- unique constraint.
create unique index if not exists payroll_runs_open_period_uidx
  on public.payroll_runs (user_id, period)
  where status <> 'cancelled';

-- ----------------------------------------------------------------
-- 4. payroll_run_items
--    employee_id is a plain text code, not a FK — an item must
--    survive later edits/deactivation of the employee record.
--    wallet_address here is the frozen snapshot taken at Approve.
-- ----------------------------------------------------------------
create table if not exists public.payroll_run_items (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid references public.payroll_runs not null,
  user_id        uuid references auth.users not null,
  employee_id    text not null,
  employee_name  text not null,
  wallet_address text not null,
  amount         numeric(20, 6) not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'sent', 'confirmed', 'failed')),
  tx_hash        text,
  error_message  text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table public.payroll_run_items enable row level security;

create policy "Users can read own payroll run items"
  on public.payroll_run_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own payroll run items"
  on public.payroll_run_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own payroll run items"
  on public.payroll_run_items for update
  using (auth.uid() = user_id);

create index if not exists payroll_run_items_run_id_idx
  on public.payroll_run_items (run_id);
