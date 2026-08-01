-- Merchant pay/accept (mobile app Phase 3) — additive only, no existing
-- tables/routes touched. Store owners create a charge, customers scan a QR
-- and pay via the existing /api/wallet/transfer, then report the payment
-- back so the merchant's polling screen sees it land.

create table if not exists public.merchant_profiles (
  user_id              uuid primary key references auth.users on delete cascade,
  store_name           text not null,
  logo_url             text,
  receive_address      text not null,
  verification_status  text not null default 'none'
                          check (verification_status in ('none', 'pending', 'verified')),
  created_at           timestamptz default now()
);

alter table public.merchant_profiles enable row level security;

create policy "Merchant can read own profile"
  on public.merchant_profiles for select
  using (auth.uid() = user_id);

create policy "Merchant can insert own profile"
  on public.merchant_profiles for insert
  with check (auth.uid() = user_id);

create policy "Merchant can update own profile"
  on public.merchant_profiles for update
  using (auth.uid() = user_id);

create table if not exists public.merchant_orders (
  id                uuid primary key default gen_random_uuid(),
  merchant_user_id  uuid references auth.users not null,
  amount            numeric(18, 2) not null,
  status            text not null default 'pending'
                       check (status in ('pending', 'paid', 'underpaid', 'expired', 'cancelled')),
  payer_address     text,
  paid_amount       numeric(18, 2),
  tx_hash           text,
  created_at        timestamptz default now(),
  expires_at        timestamptz not null,
  paid_at           timestamptz
);

alter table public.merchant_orders enable row level security;

create policy "Merchant can read own orders"
  on public.merchant_orders for select
  using (auth.uid() = merchant_user_id);

-- A customer paying an order needs to read it too (to know who/how much to
-- pay after scanning) — orders aren't individually sensitive, same posture
-- as launchpad_sales being publicly readable.
create policy "Any authenticated user can read an order by id"
  on public.merchant_orders for select
  using (auth.role() = 'authenticated');

create policy "Merchant can insert own orders"
  on public.merchant_orders for insert
  with check (auth.uid() = merchant_user_id);

create policy "Merchant can update own orders"
  on public.merchant_orders for update
  using (auth.uid() = merchant_user_id);

-- The customer's report-payment call updates status/payer/tx_hash on an
-- order they don't own — that write goes through the service-role admin
-- client server-side (see app/api/merchant/orders/[id]/report-payment/route.ts),
-- not the customer's own RLS-scoped session, so no customer-write policy is
-- needed here.

create index if not exists merchant_orders_merchant_user_id_idx
  on public.merchant_orders (merchant_user_id);
