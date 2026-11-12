-- MironPay Store on-chain orders (MironPaymentRouter, Arc Testnet).
--
-- Each order gets its own CREATE2 deposit address that commits to
-- (router_order_id, merchant_address, USDC, amount_units, expiry_unix). The
-- chain is the source of truth for payment status; these columns are only a
-- cache plus the order terms a client needs to recompute the address and
-- call the router. Additive: legacy and Circle-managed rows are untouched.

-- Safe even if 20260815_circle_managed_payments was never applied.
alter table public.merchant_orders
  add column if not exists payment_provider text not null default 'legacy';

alter table public.merchant_orders
  drop constraint if exists merchant_orders_payment_provider_check;
alter table public.merchant_orders
  add constraint merchant_orders_payment_provider_check
    check (payment_provider in ('legacy', 'circle_managed_payments', 'mironpay_router'));

alter table public.merchant_orders
  drop constraint if exists merchant_orders_status_check;
alter table public.merchant_orders
  add constraint merchant_orders_status_check
    check (status in ('pending', 'paid', 'underpaid', 'overpaid', 'expired', 'cancelled'));

alter table public.merchant_orders
  add column if not exists label text check (label is null or char_length(label) <= 40),
  add column if not exists router_address text,
  add column if not exists router_order_id text unique,
  add column if not exists merchant_address text,
  add column if not exists amount_units text,
  add column if not exists expiry_unix bigint,
  add column if not exists deposit_address text unique,
  add column if not exists credited_units text,
  add column if not exists pending_units text,
  add column if not exists excess_units text,
  add column if not exists refunded_units text,
  add column if not exists is_late boolean not null default false,
  add column if not exists chain_synced_at timestamptz,
  add column if not exists settle_requested_at timestamptz,
  add column if not exists settle_tx_id text,
  add column if not exists settle_tx_hash text;

create index if not exists merchant_orders_router_open_idx
  on public.merchant_orders (merchant_user_id, created_at desc)
  where payment_provider = 'mironpay_router';
