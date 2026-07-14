-- Persist get_swap_quote tool results on agent_messages, same reasoning
-- as 20260715_agent_messages_stablecoin_data.sql — otherwise lost on F5.
alter table public.agent_messages
  add column if not exists swap_quote_data jsonb;
