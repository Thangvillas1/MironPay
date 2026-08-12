alter table public.invoices
  add column if not exists created_block numeric,
  add column if not exists reconciliation_status text not null default 'unmatched'
    check (reconciliation_status in ('unmatched', 'matched', 'ambiguous', 'manual'));

create index if not exists invoices_reconciliation_idx
  on public.invoices(receive_address, amount, reconciliation_status, created_block);
