-- Agent Wallet session: user must explicitly approve a time-boxed window
-- before the AI agent can move funds (send/swap/gateway/launchpad).
-- Session expires on its own; no auto-renew.
alter table agent_wallets
  add column if not exists session_expires_at timestamptz;
