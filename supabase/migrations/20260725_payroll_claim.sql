-- ============================================================
-- MironPay — Payroll Claim (Beta 1.1.1)
-- Run this in: Supabase Dashboard → SQL Editor
--
-- Separate from payroll_v0 (payroll_employees/payroll_runs/payroll_run_items)
-- on purpose — this is the new uniform "everyone claims via email, no
-- pre-registration" design discussed and contract-tested this session
-- (MironPayrollClaim.sol). Does not touch or replace the old tables.
-- ============================================================

create table if not exists public.payroll_claim_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,   -- the paying company
  period         text not null,
  status         text not null default 'draft'
                   check (status in ('draft', 'paid', 'failed')),
  total_amount   numeric(20, 6) not null default 0,      -- sum of item amounts, USDC
  fee_amount     numeric(20, 6) not null default 0,      -- 0.1% platform fee, USDC
  expiry_seconds bigint not null default 864000,         -- default 10 days
  tx_hash        text,                                   -- payBatch tx
  error_message  text,
  created_at     timestamptz default now(),
  paid_at        timestamptz
);

alter table public.payroll_claim_runs enable row level security;

create policy "Users can read own payroll claim runs"
  on public.payroll_claim_runs for select
  using (auth.uid() = user_id);

create policy "Users can insert own payroll claim runs"
  on public.payroll_claim_runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own payroll claim runs"
  on public.payroll_claim_runs for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- payroll_claim_items
--   box_id / box_address are derived deterministically from email —
--   see boxIdForEmail() in app/lib/payroll-claim-chain.ts. Never store
--   a raw wallet address here; that's the entire point of this design.
-- ----------------------------------------------------------------
create table if not exists public.payroll_claim_items (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid references public.payroll_claim_runs not null,
  user_id        uuid references auth.users not null,     -- paying company, for RLS
  email          text not null,
  note           text,
  amount         numeric(20, 6) not null,
  box_id         text not null,                            -- bytes32 hex, keccak256(lower(trim(email)))
  box_address    text not null,                             -- precomputed CREATE2 address
  status         text not null default 'pending'
                   check (status in ('pending', 'paid', 'claimed', 'reclaimed', 'failed')),
  claim_tx_hash  text,
  claimed_by     uuid references auth.users,                -- set once the recipient's MironPay account claims
  claimed_at     timestamptz,
  reclaimed_at   timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table public.payroll_claim_items enable row level security;

create policy "Company can read own payroll claim items"
  on public.payroll_claim_items for select
  using (auth.uid() = user_id);

create policy "Company can insert own payroll claim items"
  on public.payroll_claim_items for insert
  with check (auth.uid() = user_id);

create policy "Company can update own payroll claim items"
  on public.payroll_claim_items for update
  using (auth.uid() = user_id);

-- Recipients need to find items addressed to *their* email, regardless of
-- which company sent them — this is a separate, narrower policy (email
-- match only, not full row access) evaluated via the JWT's email claim.
create policy "Recipients can read items addressed to their own email"
  on public.payroll_claim_items for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create index if not exists payroll_claim_items_run_id_idx
  on public.payroll_claim_items (run_id);

create index if not exists payroll_claim_items_email_idx
  on public.payroll_claim_items (lower(email));

-- box_id is keccak256(email, runId) — NOT unique per email alone (see
-- 20260726_payroll_claim_fix_box_id.sql for why a global unique index here
-- was wrong: it broke paying the same recipient across multiple runs).
create index if not exists payroll_claim_items_box_id_idx
  on public.payroll_claim_items (box_id);
