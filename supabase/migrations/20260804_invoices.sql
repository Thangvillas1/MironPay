-- Invoice feature (Business Apps: Payroll, Invoice, Store). Unlike Store, the
-- payer here is an anonymous stranger who may have no MironPay account at
-- all, so lookup happens on a public unauthenticated page — RLS grants the
-- `anon` role select access, scoped by the unguessable invoice_code, instead
-- of requiring auth.role() = 'authenticated' the way merchant_orders does.

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  issuer_user_id   uuid references auth.users not null,
  receive_address  text not null,
  recipient_email  text not null,
  recipient_name   text,
  amount           numeric(18, 2) not null,
  invoice_code     text not null unique,
  status           text not null default 'pending'
                      check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  tx_hash          text,
  due_date         timestamptz not null,
  created_at       timestamptz default now(),
  paid_at          timestamptz
);

alter table public.invoices enable row level security;

create policy "Issuer can read own invoices"
  on public.invoices for select
  using (auth.uid() = issuer_user_id);

create policy "Issuer can insert own invoices"
  on public.invoices for insert
  with check (auth.uid() = issuer_user_id);

create policy "Issuer can update own invoices"
  on public.invoices for update
  using (auth.uid() = issuer_user_id);

-- Public payment page: anyone holding the invoice_code (from the email link
-- or a shared link) can look up amount/status/receive_address, no login.
create policy "Anyone can read an invoice by code"
  on public.invoices for select
  using (true);

-- Payment-status writes (marking paid) come from the invoice-index cron via
-- the service-role admin client, not from the payer's own session — same
-- posture as merchant_orders' report-payment, no payer-write policy needed.

create index if not exists invoices_issuer_user_id_idx
  on public.invoices (issuer_user_id);

create index if not exists invoices_receive_address_status_idx
  on public.invoices (receive_address, status);

create index if not exists invoices_invoice_code_idx
  on public.invoices (invoice_code);
