-- Adds the project's own ERC-20 token address — pairs with IDOLaunchpad.sol
-- v3 (adds depositTokens()/claim()). Project deposits their own token supply
-- into the sale using their own wallet; MironPay never mints/deploys tokens.

alter table public.launchpad_submissions add column if not exists token_address text;
