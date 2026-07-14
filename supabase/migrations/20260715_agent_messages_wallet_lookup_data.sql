-- Persist get_wallet_lookup tool results on agent_messages, same reasoning
-- as 20260715_agent_messages_stablecoin_data.sql — otherwise lost on F5.
alter table public.agent_messages
  add column if not exists wallet_lookup_data jsonb;
