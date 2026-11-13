-- Store revenue: an index of MironPaymentRouter events (Arc Testnet).
--
-- Every number on the merchant Revenue screen comes from these rows, and
-- every row is copied from an on-chain event (Settled / ExcessRefunded) plus
-- its transaction receipt — the backend never computes revenue from its own
-- order cache. Rows are keyed by (tx_hash, log_index), so re-indexing a block
-- range is harmless. Service role only (no client policies).

create table if not exists public.router_events (
  tx_hash          text not null,
  log_index        integer not null,
  block_number     bigint not null,
  block_time       timestamptz not null,
  kind             text not null check (kind in ('settled', 'refunded')),
  order_key        text not null,
  router_order_id  text not null,
  merchant_address text,            -- lowercase; settled rows only
  token            text,
  credited_units   numeric(78, 0) not null default 0,
  fee_units        numeric(78, 0) not null default 0,
  net_units        numeric(78, 0) not null default 0,
  excess_units     numeric(78, 0) not null default 0,
  refund_units     numeric(78, 0) not null default 0,
  refund_to        text,
  status           smallint,
  tx_from          text not null,   -- lowercase; who paid the gas
  gas_wei          numeric(78, 0) not null default 0,  -- whole-tx gas, on the tx's first router event only
  primary key (tx_hash, log_index)
);

create index if not exists router_events_merchant_time_idx
  on public.router_events (merchant_address, block_time);
create index if not exists router_events_order_key_idx
  on public.router_events (order_key);

alter table public.router_events enable row level security;

create table if not exists public.router_index_cursor (
  id          text primary key,
  last_block  bigint not null,
  updated_at  timestamptz not null default now()
);

alter table public.router_index_cursor enable row level security;
