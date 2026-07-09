-- Real per-message input fee: replaces the old virtual $0.005 tracking-only
-- cost with a genuine on-chain USDC transfer (see app/api/agent/chat/route.ts,
-- chargeInputFee()). The receipt tx hash is stored on the USER message row
-- (the fee is for sending that message), not the assistant's reply.
alter table public.agent_messages
  add column if not exists input_fee_tx_hash text;
