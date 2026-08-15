-- PIN hashes may only be written by trusted server routes. This prevents a
-- signed-in browser from bypassing Google re-authentication with a direct
-- profiles.update({ pin_hash: ... }) call.
create or replace function public.protect_profile_pin_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pin_hash is distinct from old.pin_hash
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'PIN changes must use the secure server endpoint'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_pin_hash on public.profiles;
create trigger protect_profile_pin_hash
before update on public.profiles
for each row execute function public.protect_profile_pin_hash();

revoke all on function public.protect_profile_pin_hash() from public, anon, authenticated;
