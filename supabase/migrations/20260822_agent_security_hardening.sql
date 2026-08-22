-- Security boundary for Circle wallet ownership and Agent accounting.
-- This migration is intentionally fail-closed: trusted route handlers must use
-- service_role for these fields. This migration rewrites only inconsistent
-- duplicates (keeps the earliest identity/one wallet row) and stale prior-day
-- reservations without a Circle tx id. Those cleanup changes are not reversible;
-- policy rollback requires explicitly restoring the former grants/policies.

create table if not exists public.agent_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20,6) not null default 0,
  daily_limit numeric(20,6) not null default 5,
  daily_spent numeric(20,6) not null default 0,
  daily_reset_date date not null default current_date,
  session_expires_at timestamptz
);
-- Historical environments may have created this table outside migrations.
-- Keep one deterministic physical row per user before enforcing the invariant
-- required by atomic reservation/upsert code.
delete from public.agent_wallets a using public.agent_wallets b
where a.user_id=b.user_id and a.ctid>b.ctid;
create unique index if not exists agent_wallets_user_id_unique on public.agent_wallets(user_id);
alter table public.agent_wallets enable row level security;
drop policy if exists "Users can read own agent wallet" on public.agent_wallets;
drop policy if exists "Users can insert own agent wallet" on public.agent_wallets;
drop policy if exists "Users can update own agent wallet" on public.agent_wallets;
drop policy if exists "Users can delete own agent wallet" on public.agent_wallets;
drop policy if exists "Users can manage own agent wallet" on public.agent_wallets;
create policy "Users can read own agent wallet" on public.agent_wallets
  for select to authenticated using (auth.uid()=user_id);
revoke insert, update, delete on public.agent_wallets from authenticated;
grant select on public.agent_wallets to authenticated;

alter table public.profiles
  add column if not exists wallet_address text,
  add column if not exists circle_wallet_id text,
  add column if not exists agent_wallet_address text,
  add column if not exists agent_wallet_id text,
  add column if not exists miron_score numeric not null default 0,
  add column if not exists miron_level text not null default 'Newcomer',
  add column if not exists streak_days integer not null default 0,
  add column if not exists last_active_date date;

create or replace function public.protect_profile_server_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role' and (
      new.wallet_address is not null or new.circle_wallet_id is not null or
      new.agent_wallet_address is not null or new.agent_wallet_id is not null or
      new.pin_hash is not null or coalesce(new.miron_score,0) <> 0 or
      coalesce(new.miron_level,'Newcomer') <> 'Newcomer' or
      coalesce(new.streak_days,0) <> 0 or new.last_active_date is not null
    ) then
      raise exception 'server-owned profile fields cannot be supplied by clients' using errcode='42501';
    end if;
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and (
    new.wallet_address is distinct from old.wallet_address or
    new.circle_wallet_id is distinct from old.circle_wallet_id or
    new.agent_wallet_address is distinct from old.agent_wallet_address or
    new.agent_wallet_id is distinct from old.agent_wallet_id or
    new.pin_hash is distinct from old.pin_hash or
    new.miron_score is distinct from old.miron_score or
    new.miron_level is distinct from old.miron_level or
    new.streak_days is distinct from old.streak_days or
    new.last_active_date is distinct from old.last_active_date
  ) then
    raise exception 'server-owned profile fields cannot be changed by clients' using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_pin_hash on public.profiles;
drop trigger if exists protect_profile_server_fields on public.profiles;
create trigger protect_profile_server_fields before insert or update on public.profiles
for each row execute function public.protect_profile_server_fields();
revoke all on function public.protect_profile_server_fields() from public, anon, authenticated;
revoke insert, update on public.profiles from authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.protect_agent_wallet_server_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    new.daily_limit is distinct from old.daily_limit or
    new.daily_spent is distinct from old.daily_spent or
    new.daily_reset_date is distinct from old.daily_reset_date or
    new.session_expires_at is distinct from old.session_expires_at
  ) then
    raise exception 'agent authorization and accounting are server-owned' using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_agent_wallet_server_fields on public.agent_wallets;
create trigger protect_agent_wallet_server_fields before update on public.agent_wallets
for each row execute function public.protect_agent_wallet_server_fields();
revoke all on function public.protect_agent_wallet_server_fields() from public, anon, authenticated;

-- Project identity is public-read, service-role-write, and exactly one row.
drop policy if exists "Authenticated write" on public.miron_agent_identity;
drop policy if exists "Authenticated update" on public.miron_agent_identity;
revoke insert, update, delete on public.miron_agent_identity from anon, authenticated;
-- Preserve the earliest registered identity deterministically if historical
-- permissive RLS allowed duplicates; archive semantics are represented by
-- deleting only duplicate system rows before enforcing singleton.
delete from public.miron_agent_identity
where id not in (
  select id from public.miron_agent_identity
  order by registered_at asc nulls last, id asc limit 1
);
alter table public.miron_agent_identity add column if not exists singleton_key boolean not null default true;
alter table public.miron_agent_identity drop constraint if exists miron_agent_identity_singleton_key_check;
alter table public.miron_agent_identity add constraint miron_agent_identity_singleton_key_check check (singleton_key);
create unique index if not exists miron_agent_identity_singleton_idx
  on public.miron_agent_identity (singleton_key);

-- The browser must not be able to forge consumed intents.
revoke insert on public.agent_intent_uses from authenticated;
drop policy if exists "Users consume their own agent intents" on public.agent_intent_uses;

create table if not exists public.agent_spend_reservations (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(20,6) not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved','complete','released')),
  transaction_id text,
  transaction_hash text,
  circle_wallet_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_spend_reservations add column if not exists circle_wallet_id text;
-- Old pre-hardening rows with no Circle identifier cannot be reconciled. They
-- remain fail-closed for their original day, then are released so they do not
-- stay pending forever. Rollback cannot restore these obsolete statuses.
update public.agent_spend_reservations set status='released',updated_at=now()
where status='reserved' and transaction_id is null and created_at<current_date;
create unique index if not exists agent_spend_completed_tx_unique
  on public.agent_spend_reservations(lower(transaction_hash))
  where status='complete' and transaction_hash is not null;
alter table public.agent_spend_reservations enable row level security;
revoke all on public.agent_spend_reservations from anon, authenticated;

create or replace function public.reserve_agent_spend(
  p_user_id uuid, p_nonce text, p_amount numeric, p_effective_limit numeric
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_spent numeric; v_reserved numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  insert into agent_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  perform 1 from agent_wallets where user_id=p_user_id for update;
  update agent_wallets set daily_spent=0, daily_reset_date=current_date
    where user_id=p_user_id and daily_reset_date is distinct from current_date;
  if exists(select 1 from agent_spend_reservations where nonce=p_nonce) then return false; end if;
  select daily_spent into v_spent from agent_wallets where user_id=p_user_id;
  select coalesce(sum(amount),0) into v_reserved from agent_spend_reservations
    where user_id=p_user_id and status='reserved' and created_at >= current_date;
  if v_spent + v_reserved + p_amount > p_effective_limit then return false; end if;
  insert into agent_spend_reservations(nonce,user_id,amount) values(p_nonce,p_user_id,p_amount);
  return true;
end $$;

create or replace function public.finalize_agent_spend(
  p_user_id uuid, p_nonce text, p_transaction_id text, p_transaction_hash text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_amount numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  perform 1 from agent_wallets where user_id=p_user_id for update;
  update agent_spend_reservations set status='complete', transaction_id=p_transaction_id,
    transaction_hash=p_transaction_hash, updated_at=now()
    where nonce=p_nonce and user_id=p_user_id and status='reserved' returning amount into v_amount;
  if v_amount is null then return false; end if;
  update agent_wallets set daily_spent=daily_spent+v_amount where user_id=p_user_id;
  return true;
end $$;

create or replace function public.release_agent_spend(p_user_id uuid, p_nonce text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  update agent_spend_reservations set status='released', updated_at=now()
    where nonce=p_nonce and user_id=p_user_id and status='reserved';
  return found;
end $$;

create or replace function public.attach_agent_spend_transaction(
  p_user_id uuid, p_nonce text, p_circle_wallet_id text, p_transaction_id text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  update agent_spend_reservations set circle_wallet_id=p_circle_wallet_id,
    transaction_id=p_transaction_id, updated_at=now()
    where nonce=p_nonce and user_id=p_user_id and status='reserved'
      and (transaction_id is null or transaction_id=p_transaction_id);
  return found;
end $$;

revoke all on function public.reserve_agent_spend(uuid,text,numeric,numeric) from public,anon,authenticated;
revoke all on function public.finalize_agent_spend(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.release_agent_spend(uuid,text) from public,anon,authenticated;
revoke all on function public.attach_agent_spend_transaction(uuid,text,text,text) from public,anon,authenticated;

create or replace function public.finalize_agent_spend_actual(
  p_user_id uuid,p_nonce text,p_actual_amount numeric,p_transaction_hash text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_reserved numeric;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  perform 1 from agent_wallets where user_id=p_user_id for update;
  select amount into v_reserved from agent_spend_reservations
    where nonce=p_nonce and user_id=p_user_id and status='reserved' for update;
  if v_reserved is null or p_actual_amount<=0 or p_actual_amount>v_reserved then return false; end if;
  update agent_spend_reservations set amount=p_actual_amount,status='complete',transaction_hash=p_transaction_hash,updated_at=now()
    where nonce=p_nonce and user_id=p_user_id and status='reserved';
  update agent_wallets set daily_spent=daily_spent+p_actual_amount where user_id=p_user_id;
  return true;
end $$;
revoke all on function public.finalize_agent_spend_actual(uuid,text,numeric,text) from public,anon,authenticated;

create table if not exists public.agent_feedback_uses (
  tx_hash text primary key, user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.agent_validation_uses (
  intent_nonce text primary key, user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.agent_feedback_uses enable row level security;
alter table public.agent_validation_uses enable row level security;
revoke all on public.agent_feedback_uses, public.agent_validation_uses from anon, authenticated;

create table if not exists public.agent_limit_changes (
  idempotency_key uuid primary key, user_id uuid not null references auth.users(id),
  requested_limit numeric(20,6) not null,
  status text not null default 'claimed' check(status in ('claimed','complete','failed')),
  tx_hash text, created_at timestamptz not null default now()
);
alter table public.agent_limit_changes enable row level security;
revoke all on public.agent_limit_changes from anon, authenticated;
create or replace function public.claim_agent_limit_change(p_user_id uuid,p_key uuid,p_limit numeric)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists(select 1 from agent_limit_changes where idempotency_key=p_key) then return false; end if;
  if (select count(*) from agent_limit_changes where user_id=p_user_id and created_at>now()-interval '1 hour') >= 5 then
    raise exception 'limit update rate exceeded' using errcode='P0001';
  end if;
  insert into agent_limit_changes(idempotency_key,user_id,requested_limit) values(p_key,p_user_id,p_limit);
  return true;
end $$;
revoke all on function public.claim_agent_limit_change(uuid,uuid,numeric) from public,anon,authenticated;
