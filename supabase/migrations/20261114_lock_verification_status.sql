-- Users could self-verify: the "own profile" UPDATE/INSERT policies on
-- merchant_profiles and company_profiles let a signed-in user write any
-- column, including verification_status (and company verified_at), straight
-- through the Supabase REST API with their own JWT — i.e. grant themselves
-- the verified badge without review.
--
-- This trigger keeps the existing flows working and blocks only that:
--   * users may request review   ('none' -> 'pending')
--   * users may drop verification ('pending'/'verified' -> 'none', e.g. the
--     store rename in POST /api/merchant/setup)
--   * only the service role (backend/admin) or a direct SQL session may set
--     'verified' or touch verified_at
--   * a new row created by a user always starts unverified
-- auth.role() is 'authenticated'/'anon' for user JWTs, 'service_role' for the
-- backend, and NULL for SQL editor / migrations.

create or replace function public.guard_verification_status()
returns trigger
language plpgsql
as $$
declare
  is_user boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if not is_user then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status not in ('none', 'pending') then
      raise exception 'verification_status can only be set by MironPay review' using errcode = '42501';
    end if;
    if tg_table_name = 'company_profiles' and new.verified_at is not null then
      raise exception 'verified_at can only be set by MironPay review' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.verification_status is distinct from old.verification_status then
    if not (
      new.verification_status = 'none'
      or (new.verification_status = 'pending' and old.verification_status in ('none', 'pending'))
    ) then
      raise exception 'verification_status can only be set by MironPay review' using errcode = '42501';
    end if;
  end if;
  if tg_table_name = 'company_profiles' and new.verified_at is distinct from old.verified_at
     and new.verified_at is not null then
    raise exception 'verified_at can only be set by MironPay review' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists merchant_profiles_guard_verification on public.merchant_profiles;
create trigger merchant_profiles_guard_verification
  before insert or update on public.merchant_profiles
  for each row execute function public.guard_verification_status();

drop trigger if exists company_profiles_guard_verification on public.company_profiles;
create trigger company_profiles_guard_verification
  before insert or update on public.company_profiles
  for each row execute function public.guard_verification_status();
