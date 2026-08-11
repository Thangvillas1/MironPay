-- Extends invoices with a professional-template content model (line items,
-- tax, discount) and issuer signature verification, plus the manual
-- issuer-confirms-payment flow. Additive to 20260804_invoices.sql — no
-- existing column dropped or renamed.

alter table public.invoices
  add column if not exists line_items        jsonb not null default '[]',
  add column if not exists tax_bps            integer not null default 0,
  add column if not exists discount_amount    numeric(18, 2) not null default 0,
  add column if not exists notes              text,
  add column if not exists issuer_display_name text,
  add column if not exists issuer_address     text,
  add column if not exists content_hash       text,
  add column if not exists signature          text,
  add column if not exists signed_at          timestamptz;

-- amount stays the single source of truth for on-chain matching
-- (invoice-index / confirm-payment) — it's the computed total from
-- line_items+tax-discount at creation time, not re-derived on every read.
