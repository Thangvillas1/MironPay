-- Restored 2026-07-19 (feature was removed + tables dropped 2026-07-17/18 — see 20260718_drop_launchpad.sql and project memory). Content is a straight copy of 20260706_launchpad.sql.

-- Launchpad (IDO): project submissions (hybrid curation — self-submit + fee,
-- admin approval required), approved on-chain sales, and an off-chain cache
-- of on-chain contributions for fast UI reads.

-- ----------------------------------------------------------------
-- 1. launchpad_submissions
--    A project team's application to list a sale. Admin reviews via
--    service-role API routes (no RLS admin policy — role is checked against
--    ADMIN_EMAILS server-side), so RLS here only needs to cover the
--    submitter's own access.
-- ----------------------------------------------------------------
create table if not exists public.launchpad_submissions (
  id                uuid primary key default gen_random_uuid(),
  submitted_by      uuid references auth.users not null,
  status            text not null default 'pending_review'
                       check (status in ('pending_review', 'approved', 'rejected')),

  project_id        text unique not null,  -- url slug, e.g. "helios"
  name              text not null,
  sym               text not null,
  mark              text not null,         -- 1-2 letter logo mark
  accent            text not null,         -- hex color for logo/accent bar
  category          text not null,
  tagline           text not null,
  blurb             text not null,
  highlights        jsonb not null default '[]',
  team              jsonb not null default '[]',       -- [{name, role}]
  backers           jsonb not null default '[]',       -- [string]
  social_links      jsonb not null default '{}',       -- {website, twitter, discord, docs}
  tokenomics        jsonb not null default '[]',       -- [{label, pct, color}]
  vesting           jsonb not null default '[]',       -- [{label, detail, last}]

  price             numeric(18,6) not null,
  target            numeric(18,2) not null,
  cap               numeric(18,2) not null,        -- per-wallet max contribution
  min_contribution  numeric(18,2) not null,
  supply            text not null,
  audit             text,
  start_at          timestamptz not null,
  end_at            timestamptz not null,

  listing_fee_usdc  numeric(18,2) not null default 50,
  listing_fee_tx_hash text,

  admin_notes       text,
  reviewed_by       uuid references auth.users,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.launchpad_submissions enable row level security;

create policy "Submitter can insert own submission"
  on public.launchpad_submissions for insert
  with check (submitted_by = auth.uid());

create policy "Submitter can read own submissions"
  on public.launchpad_submissions for select
  using (submitted_by = auth.uid());

-- Approved submissions are the public-facing project content shown on the
-- Launchpad pages and referenced by agent chat — safe to expose since a
-- human already reviewed it before it reached this status.
create policy "Anyone can read approved submissions"
  on public.launchpad_submissions for select
  using (status = 'approved');

-- ----------------------------------------------------------------
-- 2. launchpad_sales
--    An approved submission becomes a live on-chain sale. Publicly
--    readable (Launchpad list/detail pages are public-ish within the app);
--    writes happen only via the admin approve action using the service role.
-- ----------------------------------------------------------------
create table if not exists public.launchpad_sales (
  id                 uuid primary key default gen_random_uuid(),
  submission_id      uuid references public.launchpad_submissions,
  project_id         text unique not null,
  sale_id_hash       text not null,   -- bytes32 hex passed to IDOLaunchpad.createSale
  contract_address   text not null,
  treasury_address   text not null,
  create_tx_hash     text,
  created_at         timestamptz not null default now()
);

alter table public.launchpad_sales enable row level security;

create policy "Anyone can read sales"
  on public.launchpad_sales for select
  using (true);

-- ----------------------------------------------------------------
-- 3. launchpad_contributions
--    Off-chain cache of successful on-chain contribute() calls, written by
--    the execute route right after a confirmed tx. Source of truth for
--    "how much has this project raised" is the chain; this table exists so
--    the UI doesn't need to query the RPC on every page load.
-- ----------------------------------------------------------------
create table if not exists public.launchpad_contributions (
  id           uuid primary key default gen_random_uuid(),
  project_id   text references public.launchpad_sales(project_id) not null,
  user_id      uuid references auth.users not null,
  amount       numeric(18,2) not null,
  tx_hash      text,
  created_at   timestamptz not null default now()
);

alter table public.launchpad_contributions enable row level security;

create policy "Contributor can read own contributions"
  on public.launchpad_contributions for select
  using (user_id = auth.uid());

create index if not exists launchpad_contributions_project_id_idx
  on public.launchpad_contributions (project_id);
