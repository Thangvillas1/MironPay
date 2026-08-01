# MironPay — Mobile Port Technical Handoff

Purpose: this document describes the **logic, flows, and technical implementation** of the
MironPay web app (Next.js) so the mobile app (UI already designed separately) can be built with the
same backend behavior. It does not describe UI/visual design — only what each screen needs to call,
send, store, and expect back.

The mobile app can either (a) call the **same backend** (this Next.js app's API routes, deployed at
`mironpay.xyz`) directly over HTTPS, reusing 100% of the server logic below, or (b) reimplement the
server logic natively. Reusing the existing API is strongly recommended — everything described
below already works in production.

**Core principle — read before implementing anything below**: an account created from the mobile
app must end up **100% identical and fully functional on desktop**, with nothing missing — same
`profiles` row shape, same full wallet pair (§2 Step 4), same tables written to. Mobile is not a
"lighter" account type; it's the same account, just a UI that only *surfaces* a subset of features
(payments-first: wallet balance, Send, Receive, Swap, Bridge). Any feature the mobile UI doesn't
show yet (e.g. the AI agent) must still have its backend data created normally during onboarding,
so the same account works without any migration/backfill if the user later logs into the desktop
app. Never take a shortcut in an API call (skip a field, skip a second wallet creation, etc.) just
because the mobile UI itself doesn't use that data today.

---

## 0. Stack summary

- **Backend**: Next.js 16 API routes (App Router), no separate backend service.
- **Auth + DB**: Supabase (Postgres + Auth). Google OAuth only, no email/password.
- **Wallets**: Circle Developer-Controlled Wallets (custodial — Circle holds keys, app signs via
  API using an "entity secret", never a raw private key).
- **Chain**: Arc Testnet only for the main wallet (`ARC-TESTNET` in Circle's naming). Chain ID
  `5042002`, RPC `https://rpc.testnet.arc.network/`, explorer
  `https://testnet.arcscan.app/tx/{hash}`, native USDC contract
  `0x3600000000000000000000000000000000000000`.
- **Bridge** (cross-chain): Circle Bridge Kit (CCTPv2) — Arc ⇄ Ethereum Sepolia / Base Sepolia.
- No native mobile SDK exists yet for any of this — the mobile app talks to the same HTTPS API.

---

## 1. Auth flow

**Sign-in is Google OAuth only.** Supabase JS: `supabase.auth.signInWithOAuth({ provider: 'google',
options: { redirectTo: '<app>/auth/callback' } })`. On mobile, this typically means an in-app
browser/ASWebAuthenticationSession redirecting to a custom URL scheme instead of a web callback
page — the important part is the **result**: Supabase returns a session containing an
`access_token` (JWT).

**Every authenticated API call attaches this token as a header:**
```
Authorization: Bearer <access_token>
```
There is **no cookie-based session** — the whole app (web) stores the token in `localStorage` and
manually attaches it to every fetch. On mobile, store the token securely (Keychain/EncryptedStorage)
and attach it the same way to every API call below.

Every API route independently validates the token server-side via
`supabase.auth.getUser()` (round-trips to Supabase to verify the JWT) and returns `401` if invalid —
**this per-route check is the actual security boundary**, not any client-side gating.

**Post-login routing decision**: after obtaining a session, check the user's `profiles` row
(`username`, `pin_hash`, `wallet_address`). If **all three are present** → go straight to the main
wallet screen. If **any is missing** → run the full onboarding flow below (even a half-completed
profile restarts onboarding from step 1 — there's no "resume where you left off" step).

---

## 2. Onboarding flow (first login only)

Exactly four steps, in this fixed order. Nothing is written to the database until step 3.

### Step 1 — Pick a username (client-side only, no DB write yet)
- Format rules (`app/lib/username.ts`), enforced live as the user types (force-lowercase, strip
  invalid chars):
  - 3–20 characters
  - only `a-z`, `0-9`, `_`
  - not in this reserved blacklist: `admin, administrator, support, help, root, system, mironpay,
    miron, null, undefined, api, auth, dashboard, login, logout, signup, register, account,
    settings, profile, user, users, mod, moderator, staff, official, owner, bot, contact, info,
    pay, payment, wallet`
- Live availability check (debounce ~500ms): query `profiles` table for existing row with this
  `username` (excluding the current user's own id, so retrying with the same name after a failed
  attempt doesn't falsely show "taken"). On mobile, this can be a lightweight API call or a direct
  Supabase query if the mobile app also has a Supabase client configured with the anon key.
- Nothing persisted yet — just carry the chosen username to the next step.

### Step 2 — Confirm username (pure UI, no network)
Show the chosen username as final/permanent, user taps confirm.

### Step 3 — Set a 6-digit PIN (this is where DB writes start)
- Two-phase UI: enter 6 digits → re-enter to confirm → must match.
- On match, call:

  **`POST /api/auth/pin/set`**
  Headers: `Authorization: Bearer <token>`
  Body: `{ "pin": "123456", "username": "chosen_username" }`
  Behavior: server computes `pin_hash = sha256("<userId>:<pin>:miron")` and **upserts** the
  `profiles` row `{ id: userId, pin_hash, username }` — this is the single write that both creates
  the profile row and sets the username permanently (unique constraint enforced at the DB level; a
  race with another user picking the same name at the same instant is possible and not specially
  handled — a generic 500 would surface).
  Response: `{ "ok": true }` (200) or `{ "error": "..." }` (400/401/500).

  ⚠️ Security note to consider for the mobile rebuild: this is plain salted SHA-256 (static salt
  string `"miron"` + user id), not bcrypt/argon2/PBKDF2 — no per-user random salt, no cost factor.
  Worth strengthening if the PIN system is being rebuilt from scratch for mobile.

### Step 4 — Wallet creation (immediately after PIN save succeeds)
  **`POST /api/create-wallet`**
  Headers: `Authorization: Bearer <token>` only, no body.
  Behavior (idempotent — safe to retry after a crash/lost connection):
  - If `profiles.wallet_address` AND `profiles.agent_wallet_address` already exist, just returns
    them (does not mint new wallets).
  - Otherwise creates **two** Circle wallets via `circleClient.createWallets({ walletSetId,
    blockchains: ['ARC-TESTNET'], count: 1, accountType: 'EOA', idempotencyKey })` — called twice:
    - "Main Wallet" → the user's spending wallet, used for all Send/Receive/Swap/Bridge below.
    - "Agent Wallet" → a second EOA reserved for the AI-agent feature.
  - **Mobile requirement: call this exactly as-is, do not skip the Agent Wallet creation.** Every
    account must end up with the same full pair of wallets as the desktop app (for backend/data
    consistency and so the agent feature can be added to mobile later without a migration step) —
    the mobile app just never *surfaces* the Agent Wallet in its UI. Only the Main Wallet
    (`wallet_address`) is shown/used anywhere in the mobile screens (balance, Send, Receive, Swap,
    Bridge). Treat `agentAddress`/`agentWalletId` in the response as data to store and ignore, not
    as something to omit from the request.
  - Persists `wallet_address`, `circle_wallet_id`, `agent_wallet_address`, `agent_wallet_id` onto
    the `profiles` row.
  Response: `{ "address": "0x...", "walletId": "...", "agentAddress": "0x...", "agentWalletId":
  "..." }`.

### Step 5 — Done
Show both addresses, then route into the main wallet screen. Onboarding is now permanently
complete for this user (checked via the three `profiles` fields at every future login).

---

## 3. PIN verification (used before every money-moving action)

Any action that spends from the custodial wallet (Send, Swap, Bridge-Withdraw) must re-verify the
PIN immediately before executing — same pattern everywhere in the app:

**`POST /api/auth/pin/verify`**
Headers: `Authorization: Bearer <token>`
Body: `{ "pin": "123456" }`
Response:
- `200 { "ok": true }` — correct PIN, proceed with the action.
- `401 { "ok": false, "error": "Incorrect PIN" }` — wrong PIN, let user retry.
- `400 { "ok": false, "error": "Invalid PIN format" }` or `"PIN not set"`.

**Important caveat to carry into the mobile design**: this PIN check is a **client-side gate
only** — the actual money-moving endpoints (`/api/wallet/transfer`, `/api/wallet/swap`,
`/api/wallet/bridge/withdraw`) do **not** themselves require a verified-PIN token or re-check
anything server-side. The UI simply doesn't call them until `/api/auth/pin/verify` has returned ok.
If the mobile app (or any other client) called the transfer/swap/withdraw endpoints directly with a
valid session token, they'd execute without a PIN at all. If this needs hardening, the fix is to
have those endpoints themselves require proof of a recent PIN verification (e.g. a short-lived
signed token returned by `/verify` and required by the money-moving routes) — this does not exist
today in the web app and would be a real improvement to make once on mobile.

---

## 4. Wallet home screen — data + balance

**`GET /api/wallet`**
Headers: `Authorization: Bearer <token>`
Returns:
```jsonc
{
  "balance": 123.45,           // USDC balance, float
  "currency": "USD",
  "tokenId": "circle-token-uuid",
  "circleWalletId": "...",
  "walletAddress": "0x...",
  "tokenList": [                // every token held, sorted verified-first then by $ value desc
    { "symbol": "USDC", "name": "USD Coin", "amount": "123.45", "usdValue": 123.45,
      "change24hPct": null, "logoUrl": "...", "isVerified": true, "tokenAddress": "0x..." },
    ...
  ],
  "transactions": [ /* see §7 shape below */ ]
}
```
Internally this calls Circle's `getWalletTokenBalance` (for balances) and `listTransactions`
(pageSize 50, for history) in parallel, then price-enriches every token via CoinGecko (with
Binance → Coinbase Exchange fallback for rate-limit resilience — see `app/lib/coingecko.ts`,
`binance.ts`, `coinbase.ts` if reimplementing pricing natively). Stablecoins (USDC/EURC/USDT) use a
fixed $1 peg instead of a live lookup.

Poll this endpoint periodically (web polls every 30s) or pull-to-refresh on mobile — there is no
push/webhook mechanism, purely polling-based.

---

## 5. Send

**`POST /api/wallet/transfer`**
Headers: `Authorization: Bearer <token>`
Body: `{ "destinationAddress": "0x...", "amount": "1.5", "memo": "optional note", "tokenSymbol":
"USDC" }` (`tokenSymbol` defaults to `"USDC"` if omitted)

Server flow:
1. Look up the token's Circle `tokenId` from the wallet's current balances; 400 if that token isn't
   held or balance is insufficient.
2. `circleClient.createTransaction({ walletId, tokenId, destinationAddress, amount: [amount], fee:
   { type: 'level', config: { feeLevel: 'MEDIUM' } }, idempotencyKey })`.
3. Polls `circleClient.getTransaction({ id, waitForState: 'SENT', pollingInterval: 1500 })` for up
   to ~20s to get the on-chain `txHash` before responding (so the UI can show a real tx hash
   immediately rather than just a pending state).
4. **If a memo was provided**: saves it to the `transaction_memos` table (fast, awaited) AND
   fire-and-forgets a second on-chain contract call (`attachMemo(address,bytes,string)` on
   `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`) so the memo is also recorded on-chain — this second
   call is NOT awaited, failures are only logged, never surfaced to the user.

Response: `{ "transactionId": "...", "txHash": "0x..." | null, "state": "COMPLETE" | "PENDING" | ... }`

UI flow before calling this: pick token → enter amount + destination address (or resolve a
`@username` to its wallet address first, if usernames are used as a send-target shorthand anywhere
in the mobile design — not read in this pass, check `app/components/SRSModal.tsx`'s "resolve
recipient" step if that's needed) → PIN verify (§3) → call this endpoint.

---

## 6. Receive (QR)

There is **no scan-to-pay flow** in the current app — QR is display-only, for receiving.

The QR code encodes **only the raw wallet address string**, nothing more (no URI scheme like
`ethereum:0x...`, no amount, no JSON). Rendered client-side with `qrcode.react`'s `QRCodeSVG`. The
user's `@username` is shown as a label next to the QR purely for human readability, not encoded in
it.

If the mobile app wants scan-to-pay (camera reads a QR and pre-fills a Send), that's new
functionality not present in the web app today — build it as: QR decodes to a wallet address (or a
richer payload if you extend the encoding) → pre-fill the Send screen's destination field → PIN
verify → `/api/wallet/transfer`.

---

## 7. Transaction history / Activity list

**Shape** (each item in `transactions` from `GET /api/wallet`):
```jsonc
{
  "id": "circle-tx-uuid",
  "type": "credit" | "debit",
  "amount": 1.5,
  "tokenSymbol": "USDC",
  "description": "Sent" | "Received" | "Swap" | "Bridge",
  "created_at": "2026-07-25T12:00:00Z",
  "state": "COMPLETE" | "PENDING" | "FAILED" | ...,
  "txHash": "0x...",
  "blockchain": "ARC-TESTNET",
  "sourceAddress": "0x...",
  "destinationAddress": "0x...",
  "networkFee": "...",
  "memo": "optional note text or undefined"
}
```

**Important quirk to preserve if reimplementing natively**: Circle's transaction API reports a
**generic Sent/Received** for everything — it never labels a transaction as "Swap" or "Bridge"
itself. The web app fixes this up server-side using a side table:

- `transaction_kinds` (Supabase table: `tx_hash` PK, `kind`, `wallet_address`, `amount`, `token`) —
  whenever the app itself executes a swap or a bridge withdrawal, it tags the resulting `tx_hash`
  with `kind: 'swap'` or `kind: 'bridge_out'` / `'bridge_in'` right after execution. `GET
  /api/wallet` joins against this table by `tx_hash` and overrides the `description` field
  accordingly (`'Swap'` / `'Bridge'` instead of the raw `'Sent'`/`'Received'`).
- **A specific gotcha**: Circle reports `amounts: []` (genuinely empty, not `"0"`) for any
  `CONTRACT_EXECUTION`-type transaction — which includes a bridge withdrawal's burn step, since
  it's a raw contract call, not a plain transfer. The app's default filter drops any outbound
  zero-amount transaction (originally meant to hide Swap's internal approve-transaction noise) —
  but a bridge withdrawal's burn is the *only* on-chain record of that withdrawal on this chain (no
  separate inbound leg to fall back on), so that filter would wrongly delete it entirely. The fix:
  the `amount`/`token` columns were added to `transaction_kinds` specifically so the real
  human-readable amount can be stored at tag-time and substituted back in, and the drop-filter now
  makes an exception for any tx_hash tagged `'bridge_out'`.
- If porting this natively (not reusing the Next.js API), you'll need to replicate this
  tag-then-join pattern, or you'll see the same "swap/bridge shows as generic Sent, and bridge
  withdrawals vanish from history entirely" bugs the web app already hit and fixed.

---

## 8. Swap (same-chain, on Arc only)

**`GET /api/wallet/swap/estimate?tokenIn=USDC&tokenOut=EURC&amountIn=10&slippageBps=1500`**
Headers: `Authorization: Bearer <token>`
Only `USDC` and `EURC` are swappable today (`SUPPORTED_TOKENS` set in the route). Returns estimated
output amount + fees, no execution.

**`POST /api/wallet/swap`**
Body: `{ "tokenIn": "USDC", "tokenOut": "EURC", "amountIn": "10", "slippageBps": 1500 }`
(`slippageBps` optional, defaults to 1500 = 15% — testnet liquidity is thin, hence the generous
default)

Internals use Circle's **Swap Kit** (`@circle-fin/swap-kit` + `@circle-fin/adapter-circle-wallets`)
— the same Circle Wallets adapter used for Bridge (see §9), configured with a `CIRCLE_KIT_KEY`
required by Circle's Stablecoin Service. `swapKit.swap()` bundles approval + swap into one call. On
success, the resulting `txHash` is tagged `kind: 'swap'` in `transaction_kinds` (see §7).

UI flow: pick token in/out + amount → optionally call `/estimate` to preview → PIN verify (§3) →
`POST /api/wallet/swap`.

---

## 9. Bridge (cross-chain: Arc ⇄ Ethereum Sepolia / Base Sepolia)

This is the most involved feature — two distinct flows with fundamentally different signing models.
**Withdraw** (Arc → external chain) spends the custodial wallet, so it needs a PIN like Send/Swap.
**Deposit** (external chain → Arc) moves the *user's own funds on an external wallet* (e.g.
MetaMask on web), so it requires connecting/signing with an external wallet instead of a PIN — this
part needs real rethinking for mobile (see note at the end of this section).

### 9a. Fee estimate (either direction, before committing)

**`GET /api/wallet/bridge/estimate?direction=withdraw|deposit&externalChain=ethereum_sepolia|base_sepolia&amount=1.0`**
Returns itemized gas + protocol fees per step, plus a combined USD total (server converts every fee
line — which can each be in a different token, e.g. ETH gas + USDC protocol fee — to USD via the
same CoinGecko/Binance/Coinbase price lookup used for wallet balances, stablecoins hardcoded to
$1). Response:
```jsonc
{
  "gasFees": [ { "name": "Approve"|"Burn"|"Mint", "token": "USDC"|"ETH", "blockchain": "Arc_Testnet"|"Ethereum_Sepolia"|...,
                 "fees": { "gas": "...", "gasPrice": "...", "fee": "0.002" } | null, "error": null } ],
  "fees": [ { "type": "kit"|"provider"|"forwarder", "token": "USDC", "amount": "0.1" } ],
  "totalUsd": 0.34,           // null if genuinely no fee data returned for this route
  "totalUsdComplete": true,    // false if some line's price lookup failed (partial total)
  "direction": "withdraw", "externalChain": "ethereum_sepolia", "amount": "1.0"
}
```
Testnet routes sometimes return empty gas/fee arrays entirely — that's not an error, just means the
SDK couldn't estimate this specific testnet route; the transfer can still proceed.

### 9b. Withdraw (Arc → external chain) — fully backend, PIN-gated, one call

Flow: enter amount + destination address on the external chain → **PIN verify (§3, same as
Send/Swap)** → `POST /api/wallet/bridge/withdraw`, body `{ "externalChain": "ethereum_sepolia" |
"base_sepolia", "amount": "1.0", "recipientAddress": "0x..." }`.

This single call blocks for the *entire* CCTP flow server-side (burn on Arc → wait for Circle's
attestation → mint on the destination chain) — can take anywhere from a few seconds to a few
minutes on testnet. Response once done:
```jsonc
{ "state": "success"|"error", "burnTxHash": "0x...", "mintTxHash": "0x...", "steps": [ ... raw SDK step objects ... ] }
```
The mobile app should show a progress/waiting screen for this whole duration (the web app's design:
a step checklist — Signing → Burning on Arc → Waiting for attestation & minting — with the last
step held until the real response arrives, since there's no real-time push from the backend).

**Who pays destination gas?** A backend-held relayer wallet (a plain private key held server-side,
`BRIDGE_RELAYER_PRIVATE_KEY` env var) submits the mint on the destination chain and pays its gas —
this is safe because CCTP's mint step is *permissionless*: anyone can submit it, and the minted
funds always go to the `recipientAddress` specified, regardless of who paid gas. The user never
needs any gas token on the destination chain for a withdrawal.

### 9c. Deposit (external chain → Arc) — needs an external wallet signature

This is the one flow that fundamentally cannot be "just call an API" — burning USDC on an external
chain requires **the actual owner of those funds to sign**, which on web means connecting MetaMask.
**On mobile, this needs its own design decision** — likely WalletConnect, or an in-app browser
wallet, or simply telling the user to complete deposits from a desktop/web session. Flagging this
explicitly since it's the biggest open question for the mobile port of Bridge.

The web flow, if useful as a reference for whatever mobile solves this with:

1. Connect external wallet, force-switch it to the correct testnet chain (`wallet_switchEthereumChain`,
   falling back to `wallet_addEthereumChain` if not yet configured in the wallet) — **critical**:
   skipping this risks the wallet being on the wrong network (e.g. real Ethereum mainnet) and
   signing against a real contract at the same address, risking real funds. This was an actual bug
   found and fixed during development — don't skip this step in any reimplementation.
2. `POST /api/wallet/bridge/deposit/prepare`, body `{ "externalChain": "...", "amount": "1.0",
   "fromAddress": "0x..." }` → returns unsigned calldata for two possible transactions:
   `{ "approve": {"to","data","value"} | null, "burn": {"to","data","value"}, ... }`. `approve` is
   `null` if the CCTP contract already has sufficient allowance from a previous deposit.
3. If `approve` is present: sign+broadcast it via the external wallet (`eth_sendTransaction`), wait
   for the receipt to actually be mined (poll `eth_getTransactionReceipt`) before continuing — the
   burn's allowance check reads live on-chain state.
4. Sign+broadcast the `burn` calldata the same way.
5. `POST /api/wallet/bridge/deposit/complete`, body `{ "externalChain": "...", "burnTxHash": "0x..."
   }` — backend fetches Circle's attestation for that burn and mints into the user's Arc wallet
   (fully backend-signed, no PIN needed for this half since it's the custodial wallet *receiving*,
   not spending). Returns `{ "mintTxHash": "0x..." }`.

No PIN is involved anywhere in deposit — only the external wallet's own signature authorizes it.

### Supported chains / explorer links (for building result screens)
| Chain | Explorer tx URL prefix |
|---|---|
| Arc Testnet | `https://testnet.arcscan.app/tx/` |
| Ethereum Sepolia | `https://sepolia.etherscan.io/tx/` |
| Base Sepolia | `https://sepolia.basescan.org/tx/` |

---

## 10. Known gaps / things to decide before/while building mobile

1. **PIN is a client-only gate** (§3) — the money-moving endpoints don't themselves require proof
   of PIN verification. Consider hardening this for mobile (e.g. a short-lived verification token).
2. **PIN hashing is weak** (plain salted SHA-256, no per-user salt/cost factor) — worth upgrading if
   rebuilding the PIN system.
3. **No server-enforced session/onboarding gating** — every page-level redirect (must be logged in,
   must have finished onboarding) is client-side only; only individual API routes' own 401 checks
   are real enforcement. Design mobile navigation guards accordingly (client-side is fine, just be
   aware the backend won't stop a request that skips the UI).
4. **Deposit's external-wallet-signing requirement (§9c)** is the single biggest open design
   question for porting Bridge to mobile — no existing mobile wallet-connect pattern in this
   codebase to reference.
5. **No push notifications / webhooks anywhere** — everything is poll-based (wallet balance, tx
   history). Mobile can poll the same way, or add its own push layer on top of the existing REST
   API without needing backend changes.
6. **Merchant "scan-to-pay" flow is fully speced in the DB/API layer but has zero UI reference** —
   see `app/api/merchant/**` routes (setup store profile → create a payment order → customer scans
   → customer calls transfer → customer self-reports payment against the order → merchant sees it
   marked paid). No QR-encoding format has been decided yet (most likely candidate: encode the
   order `id`, or a URL/deep-link containing it) — this needs to be designed as part of the mobile
   app if merchant/QR-pay is in scope, not just copied from an existing pattern.
7. **Database schema is not fully captured by the migrations folder** — some `profiles` columns
   (`wallet_address`, `circle_wallet_id`, `agent_wallet_address`, `agent_wallet_id`) and a couple of
   whole tables (`agent_messages`, `agent_wallets`) exist in the live Supabase project but were
   added outside of migration tracking. If setting up a fresh DB for mobile development, pull the
   actual current schema from the Supabase dashboard rather than relying solely on
   `supabase/migrations/*.sql`.
