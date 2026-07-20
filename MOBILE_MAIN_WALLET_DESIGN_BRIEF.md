# MironPay — Mobile Main Wallet: Flow + Logic + Logo

Single mobile screen: one wallet, payments only — Send, Receive, Swap, QR — plus live USDC→fiat conversion. No Agent Wallet, no Launchpad, no gamification on this screen.

## Flow

```
Open screen
  └─ Balance header: USDC amount + "≈ [fiat amount] [CURRENCY]" underneath
       └─ tap currency pill → picker of world fiat currencies → persists choice

  └─ 4 actions, equal weight:
       ├─ Send
       │    ├─ enter recipient (@handle / address) OR arrive here from QR scan (prefilled)
       │    ├─ enter amount — toggle USDC ⇄ fiat entry (fiat auto-converts to USDC at current rate)
       │    ├─ confirm (PIN)
       │    └─ submit → success/fail state
       ├─ Receive
       │    └─ show own QR + address (existing Receive UI)
       ├─ Swap
       │    └─ USDC ⇄ EURC (existing swap flow)
       └─ QR
            ├─ tab: "My QR" → same as Receive
            └─ tab: "Scan" → camera → decode address/payment request → hands off into Send, prefilled

  └─ (optional, below the 4 actions) recent activity — short list, "View all" → fuller history
```

## Logic

- **USDC = 1 USD** for display purposes — never fetch a live USDC/USD rate, it's noise around 1.00.
- **USD → local fiat**: the only real conversion needed. Fetch from a free FX rates API, server-side, cached and refreshed on an interval (e.g. hourly) — not fetched per page load.
- **Currency choice**: default guess from device locale on first visit; after that, remember the user's explicit pick.
- **Display only, not settlement**: the fiat number is indicative ("≈" prefix) — what actually moves on-chain is always USDC/EURC. Never let the fiat figure look like a guaranteed payout amount.
- **Send amount toggle**: typing in fiat converts to the USDC amount actually sent, using the same cached rate — this is the main reason the rate lives on this screen at all.

## Logo

Full icon kit at `/logo/` (project root), manifest at `logo/manifest.json`:
- **App icon shape**: `rounded` (5:4) — sapphire gradient, sizes 16–1024px (`miron-logo-rounded-color-*.png`)
- **Avatar shape**: `circle` (1:1) — same size set (`miron-logo-circle-color-*.png`), already square — safer choice for any masked/square icon slot
- Each shape also has `mono-white` (for dark surfaces) and `mono-ink` (for light surfaces) knockout variants
- Mark: "Mi" monogram, route-M shape + dotted "i" as a cyan spark
