-- Per-recipient reference code (e.g. "PAYROLL7HSI32S") so a company/employee
-- can look a specific Claim Box payment up later — a future search bar keys
-- off this instead of the raw box_id/tx_hash. Server-generated (not client
-- supplied) at insert time so it can't be spoofed/collided by the caller.
-- Additive only, no existing tables/routes touched.

alter table public.payroll_claim_items
  add column if not exists reference_code text;

create unique index if not exists payroll_claim_items_reference_code_key
  on public.payroll_claim_items (reference_code);
