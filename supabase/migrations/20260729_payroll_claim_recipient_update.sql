-- MironPay - Payroll Claim: missing RLS UPDATE policy for recipients.
--
-- Bug found during manual testing: claim/route.ts and reclaim/route.ts both
-- run their atomic status-lock UPDATE (WHERE status = 'paid') using the
-- RECIPIENT's own JWT, not the service role. Only two UPDATE policies existed
-- on payroll_claim_items — "Company can update own..." (auth.uid() = user_id)
-- — there was no policy letting a recipient update a row addressed to their
-- own email at all. RLS silently matched zero rows on every recipient claim
-- attempt, which the route (correctly, per its own logic) reported as
-- "Item is not claimable" — looked exactly like a lost race, but no amount of
-- retrying could ever succeed since the real blocker was permissions, not
-- timing. The route's own on-chain claim() call is still the actual trust
-- boundary (see claim/route.ts comment) — recipients being able to flip
-- their own row's status is not a new security exposure.

create policy "Recipients can update items addressed to their own email"
  on public.payroll_claim_items for update
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));
