-- Public invoice data must only be exposed through the server route
-- /api/invoices/[code], which selects an explicit non-sensitive field list.
--
-- A PostgreSQL RLS policy cannot prove that a caller "knows" a value merely
-- because their query filters by it. The previous USING (true) policy therefore
-- allowed the anon role to enumerate every row, including recipient_email.

drop policy if exists "Anyone can read an invoice by code"
  on public.invoices;

-- Defense in depth: make sure anon cannot bypass the API through PostgREST even
-- if another permissive SELECT policy is introduced accidentally.
revoke select on table public.invoices from anon;

-- One on-chain transfer may settle at most one invoice. This constraint also
-- closes races between manual confirmation and the background indexer.
create unique index if not exists invoices_paid_tx_hash_unique
  on public.invoices (lower(tx_hash))
  where tx_hash is not null;
