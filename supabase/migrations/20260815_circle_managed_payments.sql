-- Circle Managed Payments is additive and disabled by application config.
-- Existing orders remain on the legacy direct-wallet flow.

alter table public.merchant_profiles
  add column if not exists circle_merchant_wallet_id text;

alter table public.merchant_orders
  add column if not exists payment_provider text not null default 'legacy'
    check (payment_provider in ('legacy', 'circle_managed_payments')),
  add column if not exists provider_payment_intent_id text unique,
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists provider_deposit_address text,
  add column if not exists provider_chain text,
  add column if not exists provider_amount_paid numeric(18, 2),
  add column if not exists provider_synced_at timestamptz,
  add column if not exists provider_idempotency_key uuid unique,
  add column if not exists provider_error text;

create index if not exists merchant_orders_provider_payment_intent_id_idx
  on public.merchant_orders (provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create table if not exists public.circle_webhook_events (
  message_id         text primary key,
  topic_arn          text,
  notification_type text,
  payload            jsonb not null,
  processed_at       timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.circle_webhook_events enable row level security;
-- Intentionally no client policies: webhook processing uses service role only.
