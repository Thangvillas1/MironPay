-- MironPay - Payroll Claim: idempotency guard against double-submission.
-- Run this in: Supabase Dashboard -> SQL Editor
--
-- Found during UI testing: one "Approve & Sign" click resulted in TWO real
-- on-chain payBatch transactions (company charged twice). Root cause not
-- fully pinned down (likely AgentPinModal firing onSuccess more than once
-- for one PIN entry), so this adds a server-side belt-and-suspenders fix on
-- top of the client-side guard: a stable idempotency key generated once per
-- form instance lets the pay route recognize and reuse an existing run
-- instead of broadcasting a second transaction for the same intent.

alter table public.payroll_claim_runs
  add column if not exists idempotency_key text;

create unique index if not exists payroll_claim_runs_user_idempotency_uidx
  on public.payroll_claim_runs (user_id, idempotency_key)
  where idempotency_key is not null;
