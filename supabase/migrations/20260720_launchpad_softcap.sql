-- Adds softcap support to Launchpad — pairs with IDOLaunchpad.sol v2
-- (adds minRaise + refund()). See project memory / plan for context.

alter table public.launchpad_submissions add column if not exists min_raise numeric(18,2);
