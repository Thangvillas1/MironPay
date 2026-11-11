# MironPaymentRouter: Review Notes (revision 2)

Scope: `contracts/MironPaymentRouter.sol` (`MironPaymentRouter` + `DepositBox`). Target: Arc Testnet (5042002). **Not deployed.**
Depth: maximum (rule-corpus review + adversarial/functional review, 2 rounds this revision, Slither, Foundry, live-chain simulations).
Best-effort review, not a substitute for an independent third-party audit before any mainnet use.

Revision 2 adds `pay()` (native USDC), a credit cap with held excess, merchant-only `refundExcess()`, the `OrderView` struct and batch view `getOrderStatuses()`. Everything from revision 1 is kept (CREATE2 box, order struct and salt, permissionless `settle`, `FEE_BPS = 10` constant, fee forfeiture, 2-step fee recipient, `nonReentrant`, no other admin, no pause, no upgrades).

**Note:** `DepositBox` bytecode changed (`sweepNative(to, amount)`), so every predicted deposit address differs from revision 1. Nothing from revision 1 was deployed.

## Result

| Severity | Found (rev 2) | Fixed | Accepted / documented |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 0 | n/a | 0 |
| Medium | 0 from reviewers (Slither: 3, see below) | n/a | 3 |
| Low | 1 | 1 | 0 |

Final round: both reviewers returned "No material findings".

## Findings (revision 2)

1. **Critical (build): the first draft of revision 2 did not compile ("stack too deep" in `settle`).** Fixed without changing compiler settings: the accounting and the `Settled` event moved into small private helpers (`_record`, `_emitSettled`, with a memory struct). The contract builds with the default `foundry.toml` (solc 0.8.28, optimizer 200, cancun, no `via_ir`).
2. **Low: `ExcessRefunded` was emitted after the token transfer.** Now emitted after the accounting and before the sweep (a failed sweep reverts both).

### Slither (final run, 0 High)
- Medium `incorrect-equality` (x2): `credited == target` and `newFunds == 0`. Both are exact integer comparisons that are correct by construction.
- Medium `unused-return`: `sweepNative` result is deliberately ignored (best-effort dust).
- Medium `reentrancy-no-eth`: the fee sweep (an external call to our own box) happens before the accounting writes. `settle` is `nonReentrant`, so no state-changing re-entry is possible. The only residual effect is a stale **read-only** view during a token callback, which cannot happen with USDC/EURC (no callbacks). Accepted.
- Low/Informational: zero-check notes (both setters validate through `_validateFeeRecipient`), `calls-loop` in the batch view (intended), `block.timestamp` comparisons (lateness/expiry, by design), assembly, complexity, large literals.

## How the new rules behave

**`pay(order)`**: native USDC only (`token == 0x3600…`). `msg.value` must be non-zero and a multiple of 1e12. Reverts `OrderExpired` after a non-zero expiry. Reverts `Overpayment(outstanding, units)` if `units > amount - min(amount, credited + unsettled funds in box)`; held excess does not count. The value is forwarded to the deposit address (works for an undeployed box). The router keeps nothing. `pay` does not deploy the box and does not settle. A losing racer reverts and keeps their money.

**`settle(order)`**: new funds = box balance minus `excessHeld`. `toCredit = min(newFunds, amount - credited)`; the rest is `toExcess` and stays in the box. Fee = `floor(toCredit * 10 / 10000)`, never charged on excess; a failing fee transfer forfeits only that fee. Merchant gets `toCredit - fee`. An excess-only settle records and emits with no fee and no merchant transfer, and **does not set the late flag** (refinement: late is set only when new credit arrives after expiry, so a paid order is not marked late by a later donation or overpayment).

**`refundExcess(order, to, amount)`**: only `o.merchant`; `0 < amount <= excessHeld`; `to` is neither zero nor the router; exact-balance-delta sweep; no fee. The merchant chooses whether to refund the payer or keep it. Payers have **no on-chain right** to a refund; it depends on the merchant.

**Status**: `NONE=0, UNDERPAID=1, PAID=2, OVERPAID=3` (PAID with unrefunded excess). Computed from `credited + projected pending credit`, capped at the amount. `late` = sticky flag or pending credit on an expired order. `expired` is a separate flag. Transfers made directly to the address after expiry are still accepted and credited (only `pay()` is blocked), and flagged late.

### Dust / excess decision
`sweepNative(to, amount)` is factory-only and forwards exactly the amount `settle` asks for. For **USDC orders** `settle` forwards only `nativeBalance % 1e12`, the sub-1e12 remainder that has no ERC-20 representation. Held excess and unsettled USDC are whole multiples of 1e12 native wei, so they can never be moved by this path. For non-USDC orders (excess is held in that ERC-20, not native) all unrelated native in the box is forwarded to the merchant. Failures are ignored, so dust can never block a settlement. Dust is fee-free and not counted toward the order. This was chosen over "skip forwarding while excess is held", which would strand dust for as long as any excess exists.

## Known trade-offs (please confirm)

- Fee is exactly 0.1% only while the fee recipient can receive the token; otherwise that settlement's fee is forfeited. A caller giving too little gas to the fee sweep could also trigger forfeiture (costs the platform, never the merchant).
- A blocklisted merchant cannot be paid or refunded; funds stay in the box and still go only to that merchant (or, for held excess, to a destination that merchant chooses).
- Anyone can add tokens to a box. After an order is paid, a tiny donation turns its status to OVERPAID (cosmetic; the merchant can refund it or ignore it).
- `orderId` uniqueness is not enforced; identical orders share one address. The backend must issue a unique `orderId` per order.
- Lateness is judged at settlement/observation time, not at the time the payer paid.
- `getOrderStatuses` reverts as a whole if any order in the list is invalid.
- `pay()` can only be rejected against the box state at execution time; a direct transfer mined later in the same block can still create excess, which is held and refundable.
- A contract merchant must itself be able to call `refundExcess`.
- Unsupported tokens: fee-on-transfer, rebasing, malicious.
- Arc precompile/system addresses are not rejected as `merchant` (only the zero address and the router are).

## Live-chain checks on Arc Testnet (read-only: `eth_call` / `eth_estimateGas` with state overrides, no transaction sent)

The real router and box runtime code were injected at scratch addresses and run on the node's own EVM, including its native-USDC precompile.

**Behaviour (probe contract acting as the merchant):**

| Scenario | Result |
|---|---|
| External wallet sends 7 USDC native to the undeployed box of a 5 USDC order | status before settle = OVERPAID(3), pending 7,000,000, excess 2,000,000 |
| `settle` | credited 5,000,000, fee 5,000, net 4,995,000, excess 2,000,000; merchant +4,995,000; fee recipient +5,000; box keeps 2,000,000; status OVERPAID |
| `refundExcess` 2,000,000 to a payer | payer +2,000,000; status PAID; router native balance 0 |
| `pay` 5 USDC, then `settle` | status PAID before settle; fee 5,000; net 4,995,000; router balance 0 |
| `pay` 3 then `pay` 3 on a 5 USDC order | first PAID-partial (UNDERPAID); second reverted (caught), payer keeps funds |
| `pay` 3 then `pay` 2 | PAID; settle credited 5,000,000 |

**Gas (USDC)**: `eth_estimateGas`, gas price 20.5 gwei (`eth_gasPrice` at the time; base fee 20 gwei). Cost = gas x price / 1e18. Estimates are slightly conservative and move with the live gas price.

| Operation | Gas | Cost (USDC) |
|---|---|---|
| `pay()` 5 USDC, first payment (undeployed box) | ~102,900 | ~0.0021 |
| `pay()` 2 USDC top-up (box deployed, holding 3 USDC) | ~77,800 | ~0.0016 |
| `settle()` exact, first settle (deploy box + fee + merchant) | ~459,100 | ~0.0094 |
| `settle()` overpaid 7/5, first settle (adds excess accounting) | ~479,200 | ~0.0098 |
| `settle()` overpaid, repeat (box deployed, order state warm) | ~159,000 | ~0.0033 |
| `refundExcess()` 2 USDC | ~144,600 | ~0.0030 |
| `getOrderStatuses()` x 50 (all boxes empty) | ~804,400 | ~0.0165 (free as an `eth_call`) |
| `getOrderStatuses()` x 50 (25 funded) | ~809,600 | n/a |
| `getOrderStatuses()` x 50 (all funded) | ~815,100 | n/a |

The 50-order batch costs about 16,000 gas per order (mostly the cold `balanceOf` through Arc's precompile) and returned in about 0.2 s end to end from the sandbox (including CLI start-up), so polling every 2 s is comfortable. Gas limit per block is 30,000,000; an `eth_call` of this size is well inside it. The node's own `eth_call` gas cap was not queried.

## Test summary (Foundry)

138 passed, 0 failed, 1 skipped across 12 suites (`contracts/test/`).
Covers: `pay` (exact, partial plus remainder, overpay revert with funds kept, race, expiry, non-USDC, unaligned, zero value, router balance 0), cap and excess (external overpay, refund, partial refunds, excess after full payment, underpay then overpaying top-up, fee never on excess), refund permissions and edge cases, dust forwarding never touching held excess (native-backed USDC mock), fee forfeiture and blocklisted merchant atomic revert, late flag rules, batch view parity with single view (mixed 7-state list, 50 orders), fee-recipient rotation, EURC and no-bool tokens, reentrancy, fuzz (256 runs), and 7 stateful invariants (256 runs, depth 500, 0 handler reverts): box balance >= `excessHeld`, `credited <= amount`, merchant net + fees = credited, router never holds funds (token or native), refunds match `excessRefunded`, deposits = payouts + fees + refunds + box balances.
The one skipped test is the fork settle against live Arc USDC: Foundry's local EVM does not emulate Arc's native-transfer precompile. The live-chain simulations above cover that path instead.

## UNVERIFIED

- All Arc evidence is from `eth_call` / `eth_estimateGas` simulations, not mined transactions. Re-check with one small real payment, settle and refund after deployment.
- The `% 1e12` dust-forwarding path (native send from the box to a merchant) was tested locally only, not on the live chain.
- Behaviour with the real USDC blocklist (fee recipient, merchant, or refund target blocked) was tested with mock tokens only.
- Gas figures are estimates at one gas price.
- `eth_call` gas/time limits of the production RPC provider for the 50-order batch were not queried.
- No independent third-party audit has been done.
