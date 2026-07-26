-- MironPay - Payroll Claim fix: box_id must not be globally unique.
-- Run this in: Supabase Dashboard -> SQL Editor
--
-- box_id used to be derived from email alone, which made each recipient's
-- Claim Box a one-time-use address forever. Fixed to hash email + runId
-- instead, so drop the old unique index and use a plain index.

drop index if exists public.payroll_claim_items_box_id_uidx;

create index if not exists payroll_claim_items_box_id_idx
  on public.payroll_claim_items (box_id);
