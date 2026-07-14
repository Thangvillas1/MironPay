-- Persist get_stablecoin_data tool results on agent_messages, same reasoning
-- as 20260705_agent_messages_data_extras_2.sql — otherwise lost on F5.
alter table public.agent_messages
  add column if not exists stablecoin_data jsonb;
