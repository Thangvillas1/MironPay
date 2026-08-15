# Circle Managed Payments merchant orders

## Implementation checkpoint — waiting for Circle

Status as of 2026-08-15: code implementation and local static checks are
complete. Do not enable or deploy the integration until Circle replies.

Completed locally:

- Additive database schema for provider-neutral merchant orders and webhook
  deduplication.
- Transient payment-intent creation and expiration behind a disabled flag.
- Deposit-address provisioning through webhook with throttled polling fallback.
- SNS signature verification, subscription confirmation, duplicate handling,
  and protection against late events reopening terminal orders.
- Mobile QR waits for Circle's order-specific deposit address and never falls
  back to the merchant's legacy wallet for a Managed Payments order.
- Backend TypeScript and ESLint pass; mobile TypeScript and all three EIP-681
  tests pass.

Waiting for Circle to confirm:

1. Whether Arc is supported by Managed Payments payment intents and the exact
   value required in `paymentMethods[].chain`.
2. Whether this account should call `/v1/paymentIntents` or the newer
   `/v1/cpn/managedPayments/paymentIntents` path.
3. Whether transient intents on this account require `merchantWalletId`, and
   whether one platform wallet or a merchant-specific sub-wallet should be used.
4. Whether `paymentIntents` and `payments` events for Arc are delivered through
   the v1 SNS notification subscription flow.

Resume point after Circle replies:

1. Update only the environment values/path required by Circle.
2. Review the response payload against the typed adapter before changing code.
3. Apply the migration in sandbox.
4. Register the sandbox webhook and leave production disabled.
5. Test address provisioning, exact payment, underpayment, duplicate webhook,
   expiration, and cancellation end-to-end.
6. Report sandbox evidence before requesting production activation.

This integration is off by default. Existing merchant orders continue using
the legacy direct-wallet flow until the server flag is enabled.

Required server environment variables:

```dotenv
CIRCLE_MANAGED_PAYMENTS_ENABLED=false
CIRCLE_MANAGED_PAYMENTS_API_KEY=
CIRCLE_MANAGED_PAYMENTS_MERCHANT_WALLET_ID=
CIRCLE_MANAGED_PAYMENTS_CHAIN=ARC
CIRCLE_MANAGED_PAYMENTS_BASE_URL=https://api-sandbox.circle.com
CIRCLE_MANAGED_PAYMENTS_INTENTS_PATH=/v1/paymentIntents
CIRCLE_MANAGED_PAYMENTS_PURPOSE=PMT001
```

Before enabling:

1. Apply `supabase/migrations/20260815_circle_managed_payments.sql`.
2. Confirm the Arc chain identifier and payment-intent endpoint enabled for the
   Circle account; both are configuration values so no code change is needed.
3. Register `https://<backend>/api/webhooks/circle-managed-payments` through
   Circle's v1 notification subscription API.
4. Use sandbox credentials and create a small test order. The screen must stay
   in “preparing address” until Circle returns the intent deposit address.
5. Verify `paymentIntents` and `payments` notifications update the same order,
   including duplicate and out-of-order delivery.
6. Enable production only after the sandbox flow is reconciled end-to-end.

The webhook accepts Amazon SNS envelopes, validates their certificate/signature,
deduplicates by `MessageId`, and confirms subscription URLs only on an approved
AWS SNS HTTPS hostname. Circle webhooks are primary; throttled intent polling is
the fallback while the merchant waits for an address or final status.
