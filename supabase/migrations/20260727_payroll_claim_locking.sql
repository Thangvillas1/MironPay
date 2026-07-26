-- MironPay - Payroll Claim: locking guards found during manual testing.
-- Run this in: Supabase Dashboard -> SQL Editor
--
-- 1) Double-click Claim/Reclaim: the item's status only flipped from 'paid'
--    to 'claimed'/'reclaimed' AFTER the on-chain tx succeeded, so a second
--    click (or a retried request) firing before the first tx confirmed could
--    submit a second real transaction. The contract itself would revert the
--    second one ("Already claimed or reclaimed"), so no funds were ever at
--    risk, but it wasted relayer gas on a guaranteed-to-fail tx every time.
--    Fix: an intermediate 'claiming'/'reclaiming' status lets the route do
--    an atomic conditional UPDATE (WHERE status = 'paid') as a lock before
--    touching the chain — a second concurrent request finds zero rows
--    updated and bails out immediately, no tx submitted at all.
--
-- 2) Concurrent payroll runs from the same company: two "New payroll run"
--    submissions in flight at once could both pass the preflight balance
--    check before either one actually spends anything, then race on-chain.
--    Fix: only one 'draft' run per user_id may exist at a time (partial
--    unique index). The route clears out its own stale drafts (crashed
--    mid-request, left stuck in 'draft') before inserting a new one.

alter table public.payroll_claim_items
  drop constraint if exists payroll_claim_items_status_check;

alter table public.payroll_claim_items
  add constraint payroll_claim_items_status_check
  check (status in ('pending', 'paid', 'claiming', 'reclaiming', 'claimed', 'reclaimed', 'failed'));

create unique index if not exists payroll_claim_runs_one_draft_per_user_uidx
  on public.payroll_claim_runs (user_id)
  where status = 'draft';
