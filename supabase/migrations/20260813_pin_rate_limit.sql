-- Durable, cross-instance PIN throttling. Rows are never exposed directly;
-- authenticated callers can only operate on their own row through RPCs.
create table if not exists public.pin_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pin_attempts enable row level security;
revoke all on table public.pin_attempts from anon, authenticated;

create or replace function public.check_pin_rate_limit(p_user_id uuid)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until timestamptz;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  select locked_until into v_locked_until
  from public.pin_attempts
  where user_id = p_user_id;

  if v_locked_until is not null and v_locked_until > now() then
    return query select false, greatest(1, ceil(extract(epoch from (v_locked_until - now())))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

create or replace function public.record_pin_result(p_user_id uuid, p_success boolean)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pin_attempts%rowtype;
  v_count integer;
  v_window timestamptz;
  v_locked timestamptz;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  if p_success then
    delete from public.pin_attempts where user_id = p_user_id;
    return query select true, 0;
    return;
  end if;

  insert into public.pin_attempts(user_id, failed_count, window_started_at, updated_at)
  values (p_user_id, 0, now(), now())
  on conflict (user_id) do nothing;

  select * into v_row from public.pin_attempts where user_id = p_user_id for update;
  if v_row.window_started_at <= now() - interval '15 minutes' then
    v_count := 1;
    v_window := now();
  else
    v_count := v_row.failed_count + 1;
    v_window := v_row.window_started_at;
  end if;

  v_locked := case when v_count >= 5 then v_window + interval '15 minutes' else null end;

  insert into public.pin_attempts(user_id, failed_count, window_started_at, locked_until, updated_at)
  values (p_user_id, v_count, v_window, v_locked, now())
  on conflict (user_id) do update set
    failed_count = excluded.failed_count,
    window_started_at = excluded.window_started_at,
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at;

  if v_locked is not null and v_locked > now() then
    return query select false, greatest(1, ceil(extract(epoch from (v_locked - now())))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

revoke all on function public.check_pin_rate_limit(uuid) from public, anon;
revoke all on function public.record_pin_result(uuid, boolean) from public, anon;
grant execute on function public.check_pin_rate_limit(uuid) to authenticated;
grant execute on function public.record_pin_result(uuid, boolean) to authenticated;
