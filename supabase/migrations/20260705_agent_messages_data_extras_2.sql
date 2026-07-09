-- Persist trending/defi/sentiment tool data on agent_messages, same reasoning
-- as 20260705_agent_messages_data_extras.sql (chart/data-fee) — otherwise lost on F5.
alter table public.agent_messages
  add column if not exists trending_data jsonb,
  add column if not exists defi_data jsonb,
  add column if not exists sentiment_data jsonb;
