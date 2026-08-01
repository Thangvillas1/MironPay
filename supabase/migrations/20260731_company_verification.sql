-- Company business verification (the "blue tick" next to a company's name in
-- Payroll claim emails and settings). Mirrors merchant_profiles.verification_status
-- exactly — same three states, same manual-only approval, no admin UI yet.
-- Additive only, no existing tables/routes touched.

create table if not exists public.company_profiles (
  user_id               uuid primary key references auth.users on delete cascade,
  legal_name            text,
  registration_number   text,
  email_domain          text,
  verification_status   text not null default 'none'
                           check (verification_status in ('none', 'pending', 'verified')),
  submitted_at           timestamptz,
  verified_at             timestamptz,
  created_at            timestamptz default now()
);

alter table public.company_profiles enable row level security;

create policy "Company can read own profile"
  on public.company_profiles for select
  using (auth.uid() = user_id);

create policy "Company can insert own profile"
  on public.company_profiles for insert
  with check (auth.uid() = user_id);

create policy "Company can update own profile"
  on public.company_profiles for update
  using (auth.uid() = user_id);

-- Recipients need to read the *paying company's* verification status AND
-- legal name (to show both the tick and "Paid by <legal name>" in their
-- claim inbox/email), not just their own — narrowly scoped to only rows
-- that are actually verified (a company's legal name isn't sensitive once
-- they've opted into public verification), via a read-only view rather
-- than widening the base table's RLS to "any authenticated user".
create or replace view public.company_verification_public as
  select user_id, verification_status, legal_name
  from public.company_profiles
  where verification_status = 'verified';

grant select on public.company_verification_public to authenticated;
