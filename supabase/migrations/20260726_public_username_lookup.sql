-- ============================================================
-- Public username/address lookup
-- RLS on public.profiles only allows a user to SELECT their own row
-- (see 001_initial_schema.sql), so client-side lookups of *other*
-- users' username <-> wallet_address (send-money recipient resolution,
-- tx history display, onboarding availability check) always silently
-- returned no rows. These RPCs expose only the two safe fields
-- (username, wallet_address) instead of loosening the row policy.
-- ============================================================

create or replace function public.resolve_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select wallet_address from public.profiles where username = p_username limit 1;
$$;

create or replace function public.resolve_wallet_address(p_wallet_address text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select username from public.profiles where wallet_address = p_wallet_address limit 1;
$$;

create or replace function public.is_username_taken(p_username text, p_exclude_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where username = p_username
      and (p_exclude_id is null or id <> p_exclude_id)
  );
$$;

grant execute on function public.resolve_username(text) to anon, authenticated;
grant execute on function public.resolve_wallet_address(text) to anon, authenticated;
grant execute on function public.is_username_taken(text, uuid) to anon, authenticated;

-- Same RLS gap breaks the leaderboard: "top 10" and "rank" queries in
-- app/api/score/leaderboard/route.ts read OTHER users' profiles, which
-- the "own row only" SELECT policy silently empties out.
create or replace function public.leaderboard_top(p_limit int default 10)
returns table(id uuid, username text, miron_score numeric, miron_level text)
language sql
security definer
set search_path = public
stable
as $$
  select id, username, miron_score, miron_level
  from public.profiles
  where miron_score is not null and miron_score > 0
  order by miron_score desc
  limit p_limit;
$$;

create or replace function public.count_users_with_score_above(p_score numeric)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*) from public.profiles where miron_score > p_score;
$$;

grant execute on function public.leaderboard_top(int) to anon, authenticated;
grant execute on function public.count_users_with_score_above(numeric) to anon, authenticated;
