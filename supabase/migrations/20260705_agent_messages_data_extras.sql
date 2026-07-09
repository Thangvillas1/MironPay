-- Persist x402 data-fee and price-chart metadata on agent_messages so they
-- survive a page reload (previously ephemeral, lost on F5).
alter table public.agent_messages
  add column if not exists data_fee_amount numeric,
  add column if not exists data_fee_tx_hash text,
  add column if not exists chart_symbol text,
  add column if not exists chart_points jsonb;
