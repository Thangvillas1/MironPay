-- Fix: RLS policies existed on miron_agent_identity but RLS itself was
-- never enabled on the table, so it was fully open to anon read+write.
-- Single-row system table (agent identity, not user data) — public read,
-- writes restricted to authenticated sessions (register-onchain / feedback
-- routes call Supabase with the logged-in user's JWT, not service role).

alter table miron_agent_identity enable row level security;

drop policy if exists "Public read" on miron_agent_identity;
create policy "Public read"
  on miron_agent_identity
  for select
  to anon, authenticated
  using (true);

create policy "Authenticated write"
  on miron_agent_identity
  for insert
  to authenticated
  with check (true);

create policy "Authenticated update"
  on miron_agent_identity
  for update
  to authenticated
  using (true)
  with check (true);
