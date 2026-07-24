-- Circle's transaction list reports empty amounts ([]) for any
-- CONTRACT_EXECUTION-type outbound call (approve/burn), including a bridge
-- withdraw's burn step, which has no corresponding inbound leg on this chain
-- to fall back on (unlike swap/deposit, whose inbound leg carries a real
-- amount). Store the human-readable amount/token ourselves at tag time so
-- app/api/wallet/route.ts can display it instead of Circle's empty value.
alter table public.transaction_kinds
  add column if not exists amount text,
  add column if not exists token text;
