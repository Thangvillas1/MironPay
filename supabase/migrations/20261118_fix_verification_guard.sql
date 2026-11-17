-- Fix for 20261114_lock_verification_status.sql: creating or renaming a store
-- failed with `record "new" has no field "verified_at"`.
-- PL/pgSQL does not short-circuit `tg_table_name = 'company_profiles' and
-- new.verified_at …` — it still resolves new.verified_at on merchant_profiles,
-- which has no such column. Read it through to_jsonb() instead (NULL when the
-- column doesn't exist). The rules themselves are unchanged.

create or replace function public.guard_verification_status()
returns trigger
language plpgsql
as $$
declare
  is_user boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
  new_verified_at text := to_jsonb(new) ->> 'verified_at';
  old_verified_at text;
begin
  if not is_user then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status not in ('none', 'pending') then
      raise exception 'verification_status can only be set by MironPay review' using errcode = '42501';
    end if;
    if new_verified_at is not null then
      raise exception 'verified_at can only be set by MironPay review' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  old_verified_at := to_jsonb(old) ->> 'verified_at';
  if new.verification_status is distinct from old.verification_status then
    if not (
      new.verification_status = 'none'
      or (new.verification_status = 'pending' and old.verification_status in ('none', 'pending'))
    ) then
      raise exception 'verification_status can only be set by MironPay review' using errcode = '42501';
    end if;
  end if;
  if new_verified_at is distinct from old_verified_at and new_verified_at is not null then
    raise exception 'verified_at can only be set by MironPay review' using errcode = '42501';
  end if;
  return new;
end;
$$;
