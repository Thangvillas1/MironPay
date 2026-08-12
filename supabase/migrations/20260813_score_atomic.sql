alter table public.profiles
  add column if not exists miron_score numeric not null default 0,
  add column if not exists miron_level text not null default 'Newcomer',
  add column if not exists streak_days integer not null default 0,
  add column if not exists last_active_date date;

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  event_id text,
  points numeric not null,
  created_at timestamptz not null default now()
);

-- Older deployments may already have score_events without an idempotency key.
alter table public.score_events add column if not exists event_id text;
update public.score_events
set event_id = 'legacy:' || id::text
where event_id is null;
alter table public.score_events alter column event_id set not null;
create unique index if not exists score_events_user_action_event_uidx
  on public.score_events(user_id, action_type, event_id);

create table if not exists public.score_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  score numeric not null,
  level text not null,
  created_at timestamptz not null default now(),
  primary key(user_id, snapshot_date)
);

alter table public.score_events enable row level security;
alter table public.score_history enable row level security;

drop policy if exists "Users can read own score events" on public.score_events;
create policy "Users can read own score events" on public.score_events
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own score history" on public.score_history;
create policy "Users can read own score history" on public.score_history
  for select using (auth.uid() = user_id);

create or replace function public.award_miron_score(
  p_user_id uuid,
  p_action text,
  p_event_id text
)
returns table(score numeric, level text, earned numeric, streak integer, multiplier numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_base numeric;
  v_points numeric;
  v_score numeric;
  v_level text;
  v_streak integer;
  v_multiplier numeric;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event_id is required';
  end if;

  v_base := case p_action
    when 'send' then 2
    when 'swap' then 3
    when 'agent_tx' then 1
    when 'deposit' then 1
    when 'feedback' then 5
    when 'daily_login' then 0.5
    else null
  end;
  if v_base is null then raise exception 'Invalid score action'; end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  if exists(select 1 from public.score_events where user_id=p_user_id and action_type=p_action and event_id=p_event_id) then
    return query select v_profile.miron_score, v_profile.miron_level, 0::numeric,
      v_profile.streak_days, 1::numeric;
    return;
  end if;

  v_streak := v_profile.streak_days;
  if p_action = 'daily_login' then
    if v_profile.last_active_date = current_date - 1 then
      v_streak := v_streak + 1;
    elsif v_profile.last_active_date is distinct from current_date then
      v_streak := 1;
    end if;
  end if;

  v_multiplier := case when v_streak >= 30 then 1.5 when v_streak >= 7 then 1.2 else 1 end;
  v_points := round(v_base * v_multiplier, 2);
  v_score := round(coalesce(v_profile.miron_score, 0) + v_points, 2);
  v_level := case when v_score >= 600 then 'Elite' when v_score >= 300 then 'Trader'
    when v_score >= 100 then 'Builder' else 'Newcomer' end;

  insert into public.score_events(user_id, action_type, event_id, points)
  values(p_user_id, p_action, p_event_id, v_points);

  update public.profiles set
    miron_score=v_score, miron_level=v_level, streak_days=v_streak,
    last_active_date=case when p_action='daily_login' then current_date else last_active_date end
  where id=p_user_id;

  insert into public.score_history(user_id, snapshot_date, score, level)
  values(p_user_id, current_date, v_score, v_level)
  on conflict(user_id, snapshot_date) do update set score=excluded.score, level=excluded.level;

  return query select v_score, v_level, v_points, v_streak, v_multiplier;
end;
$$;

revoke all on function public.award_miron_score(uuid, text, text) from public, anon, authenticated;
grant execute on function public.award_miron_score(uuid, text, text) to service_role;
