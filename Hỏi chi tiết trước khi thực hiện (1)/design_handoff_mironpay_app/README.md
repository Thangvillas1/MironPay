# Handoff: MironPay Mobile Wallet App

## Overview
MironPay is a mobile crypto wallet: Google sign-in, PIN + Face ID biometric security, send/receive/swap of stablecoins and ETH, QR-based in-person payments (both paying a merchant and accepting payment as a merchant), an activity feed, a points/leaderboard program, and account/security settings. This package covers the app in its current, most complete state, including the Face ID biometric layer that gates app entry and every send/swap/payment confirmation.

## About the Design Files
The bundled file (`MironPay App Obsidian.dc.html`) is a **design reference built in HTML** — a runnable interactive prototype — not production code to copy directly. It is a single-file component (custom `<x-dc>`/`<script>` runtime driven by the included `support.js`); open it in a browser to click through every flow exactly as specified. The task is to **recreate this design in the target app's real environment**: native iOS (SwiftUI) and/or Android (Jetpack Compose/Kotlin) if this ships natively, or React Native/Flutter for cross-platform. If no mobile codebase exists yet, choose whichever framework the team is best equipped to ship and maintain — React Native is a reasonable default for fastest parity with this prototype. Do not ship the HTML itself; do not treat `support.js` as runtime to reuse — it only exists to make this reference file open and interactive for you.

## Fidelity
**High-fidelity.** Colors, type, spacing, corner radii, iconography, copy, and animation timings are final intent, not placeholders. Recreate pixel-for-pixel where feasible. Where a real platform convention differs — the real Face ID/Touch ID system sheet, the real OS status bar/notch, native haptics — follow platform convention instead of the mock's fake status bar/fake Face ID UI, but preserve the surrounding screen design, copy, and the exact sequencing described below.

## Real device target — not a desktop mockup
The HTML wraps the phone screen in a decorative black bezel for desktop preview convenience only. At viewport widths ≤480px (i.e. an actual phone), the bezel disappears via a media query and the screen becomes a true full-bleed `100dvh` view, edge to edge. **That full-bleed state is the real target.** The bezel, the fake "9:41" status bar, and the notch/island shown in the mock simulate OS chrome for the web preview — on a real native build, use the actual system status bar instead of redrawing one, except where the app is a home-screen/PWA web build with no OS chrome, in which case keep the fake status bar to fill that space.

## Screens / Views

### Onboarding & Auth
- **Welcome** — Logo lockup (dark/light variant), tagline "Real wallets on Arc. No password. No seed phrase.", single primary action "Launch App" (Google "G" mark + label), footnote explaining sign-in creates a main wallet + a separate limited AI-agent wallet.
- **Google Auth** (transient, auto-advances) — Centered pulsing app icon, "Connecting to Google…" / "Confirming it's really you". Auto-advances after **1200ms** to Username (new user) or Sign-in PIN (returning user, has account).
- **Username** — Header "Choose your username", subcaption "Signed in as {email}", `@`-prefixed input, live validity check (regex `^[a-z0-9_]{3,20}$`, taken-name list), inline success/error icon and message, primary "Continue" (disabled until valid) opens a confirm dialog.
- **Username confirm** (modal) — "Lock in @{username}?" warning icon, copy explaining the handle is permanent, a required checkbox acknowledgement, "Go back" / "Confirm" (disabled until checked).
- **Create PIN** — "Create your PIN", helper copy "You'll use this to confirm sends and unlock MironPay", 6-dot progress row, numeric keypad (1–9, 0, ⌫). Auto-advances to Confirm PIN at 6 digits.
- **Confirm PIN** — Same layout, re-enter the 6 digits; mismatch shows "PINs don't match, try again" + toast and clears the field; match proceeds to Provisioning.
- **Provisioning** (transient, auto-advances) — Pulsing app icon, "Setting up your wallets on Arc", a 3-row checklist (pending → active/pulsing → done-check) advancing one step every **550ms**, then to Auth Done.
- **Auth Done** — Success ring+check icon (pop animation), "Your wallets are ready", two summary cards (Main wallet / AI Agent wallet with truncated addresses), primary "Enter MironPay" — **this now triggers the Face ID entry gate** (see Biometric flow) instead of going straight to Home.
- **Sign-in PIN** (returning user) — Avatar initials circle, "@{username}", "Enter your PIN to continue", 6-dot row + keypad. Correct PIN → **Face ID entry gate** → Home. Wrong PIN → shake/error toast, clear field.

### Biometric (Face ID) — new layer, applies uniformly everywhere
A single visual pattern is reused for every biometric moment in the app: a 210×210 dark viewfinder card with corner brackets, a vertical scanning laser line, a small face-outline glyph, and (on resolution) a checkmark or an X, both center-popping in. Color of the brackets/face glyph: gold while scanning, green (`--up`) on success, red (`--dn`) on failure.
- **App-entry gate** — Runs every time the app reaches Home: right after "Enter MironPay" (new user) and right after a correct sign-in PIN (returning user), and again whenever the wallet is manually locked (Security → "Lock wallet now"). Full-screen takeover, title "Unlock with Face ID", sub "Look at your camera to unlock MironPay". Auto-starts scanning; after **1300ms** resolves.
  - Success: title flips to "Face ID verified", green check pops in, holds **550ms**, then unlocks straight into Home (or back to whatever was underneath, for a manual re-lock).
  - Failure: title flips to "Face not recognized", red X pops in, buttons appear: "Try Face ID again" (rescans) and "Use PIN instead" (drops to the PIN keypad, same 6-dot pattern as Sign-in PIN). "Log out instead" is always available underneath as an escape hatch back to Welcome.
  - 3 consecutive Face ID failures anywhere in the app → Face ID locks out for **30 minutes**, forcing PIN entry for that whole window (PIN itself is never locked — only the biometric method), with a "Face ID is temporarily locked" note above the PIN dots.
- **Transaction confirm gate** — Applies identically to **Send, Swap, and Pay-a-merchant**. After the user reviews the transaction details and taps "Confirm" on the review card, the same face-scan takeover appears (title "Confirm with Face ID", sub "Look at your camera to confirm this transfer / swap / payment."). Success executes the transaction (same broadcasting/busy overlay and success screen as before this layer existed); failure/fallback behaves exactly as the entry gate, plus a "Cancel transfer / swap / payment" link that aborts back to the form without executing anything.
- **Settings toggle** — Security hub has a Face ID on/off switch (styled exactly like the existing 2FA switch). Off: every gate above is skipped and PIN is used directly, with no scan UI shown at all.
- **Merchant "accept payment" side is unaffected** — a merchant watching their own charge screen for incoming payment is not authorizing an outgoing action, so it does not go through Face ID.

### Home & Wallet
- **Home** — Logo lockup + theme toggle in the header; "TOTAL ASSETS" kicker with a live daily-change pill; large tabular-figure total (integer large, decimals smaller/muted) with a "≈ converted-currency" line and a currency picker pill; "ASSETS" list of 4 tokens (USDC, EURC, USDT, ETH), each row: colored glyph disc, symbol + balance, fiat value + day change; tapping a row expands an inline detail (live price, 24h/7d/30d timeframe chips, a small SVG candlestick chart, and Send/Receive/Swap quick actions) in place. Bottom tab bar: Wallet / Activity / center raised QR button (with an animated scan-laser + pulsing ripple) / Store / Profile.
- **Send → Amount → Review** (`send`/`amount`/`review` screens) — Recipient search/contacts list with favorites, add/edit contact bottom sheet, or paste an external address; token rail picker (horizontal snap carousel); numeric amount entry with 10/25/50/Max quick-percent buttons, insufficient-balance state; memo field; review screen recaps amount, recipient, network fee, total. Primary action opens the **review-confirm modal**.
- **Review-confirm modal** (shared by Send/Swap/Pay) — Centered card, gold check icon, "Confirm this transfer / swap / payment?" + recap line, "Go back" / "Confirm". Confirm now hands off to the **Face ID transaction gate** above instead of executing immediately.
- **Swap** — From/To token selectors (bottom-sheet picker), amount with quick-percent buttons, live rate line, slippage control (Auto/2%/5%/custom), minimum-received line, flip-direction button. Same review-confirm → Face ID → busy → success sequence.
- **Success** — Ring+check icon, transaction title, large signed amount (green add / default remove tint), converted-currency + fee/rate subline, optional memo chip, optional "+N pts earned" pill, a hash pill linking to the Explorer view, "Done" / "Save receipt".
- **Explorer** — Simulated block-explorer detail: network + status pills, tappable full tx hash (copy), a bordered detail table (type, block, timestamp, from, to, value + fiat, network fee), disclaimer footnote.
- **Receive** — MironPay code (canvas-rendered QR with center logo mark), handle, copyable address pill.
- **QR** (Scan/My-code segmented control) — My-code view duplicates Receive's QR; Scan view is a dark viewfinder with corner brackets + moving laser, "Point at a MironPay code"; after a simulated delay it resolves to `Pay-confirm` with mock merchant data.
- **Activity** — Full transaction list (icon avatar, counterparty + date/kind, signed amount + fiat), tap-through to Explorer.

### Rewards
- **Leaderboard** — Ranked list of ~48 users by points, current user's row highlighted/pinned styling, medal tinting for top 3 (gold/silver/bronze), tier coloring (Bronze/Silver/Gold/Platinum) by point thresholds (1,000 / 5,000 / 15,000).
- **Profile** — Avatar initials, @handle + email; Rewards card (points total, tier) linking to Leaderboard; Account list: Wallet address (copy), "Buy USDC with card" (opens Buy sheet), Appearance (dark/light toggle inline), Conversion currency (opens currency sheet), Security (summary line), Support (stub), Log out.
- **Buy USDC sheet** — Amount entry + payment method chips (e.g. Apple Pay / card), confirms into the same busy/success pattern.

### Security & Settings
- **Security hub** — AUTHENTICATION group: Two-factor authentication toggle, **Face ID toggle (new)**, Change PIN row. DEVICES & ACTIVITY group: Login activity, Trusted devices. EMERGENCY group: "Lock wallet now" (red) → triggers the Face ID/PIN entry gate immediately.
- **Change PIN**, **Trusted devices**, **Login activity** — Standard settings list screens (device name/location/last-active, revoke; login timestamp/location with a blocked/flagged state highlighted in red).
- **Lock confirm** (modal) — "Lock wallet now?" warning, explains Send/Swap/Buy freeze until unlock, Cancel / "Lock now".

### Merchant — paying a merchant (customer side, uses Face ID)
- **Pay-confirm** — Reached via the QR scan flow. Shows merchant name + verified badge, amount, address, insufficient-balance/expired states, disclaimer to check the name not the address, "Confirm payment" → review-confirm modal → Face ID gate → busy → Success.

### Merchant — accepting payment (merchant side, no Face ID)
- **Merchant setup** — First-time store name entry, "Activate store".
- **Merchant home** — Store summary, "Get the gold badge" verification prompt (if unverified) → **Merchant verify** (document-type picker → submit → busy "Reviewing your document…" → verified badge), numeric charge keypad, "Create charge".
- **Merchant wait** — Live QR + countdown (180s), polling for payment; simulated underpaid state (partial amount received, "keep waiting" vs cancel) and a cancel-order confirm modal; auto-expires the order if the timer runs out.
- **Merchant paid** — Success chime + haptic, paid confirmation, auto-returns to a fresh charge screen after 5s.
- **Merchant history** — Today's total, searchable list of past charges with status pills (Paid / Underpaid / Expired / Cancelled).

## Interactions & Behavior

### Full navigation flow (the parts that must match exactly)

**New user onboarding:**
Welcome → (tap Launch App) → Google Auth (auto, 1200ms) → Username → Username-confirm modal → Create PIN (6 digits) → Confirm PIN (6 digits, must match) → Provisioning (auto, 3 steps × 550ms) → Auth Done → (tap "Enter MironPay") → **Face ID entry gate** → Home.

**Returning user sign-in:**
Welcome → Google Auth (auto) → Sign-in PIN (6 digits, must match stored PIN) → **Face ID entry gate** → Home.

**Manual re-lock:**
Profile → Security → "Lock wallet now" → confirm modal → **Face ID entry gate** (same component) → unlock returns to whatever screen was active.

**Any transaction (Send / Swap / Pay-a-merchant) — identical shape for all three:**
Fill form → Review → tap primary action → review-confirm modal ("Confirm this transfer/swap/payment?") → tap Confirm → **Face ID transaction gate** → on success: busy/broadcasting overlay (**1600ms**) → Success screen. Cancelling at any point in the Face ID gate returns to the form with nothing executed.

**Face ID gate internal state machine** (identical for entry and transaction contexts):
1. If Face ID is disabled in settings, or currently in its 30-minute lockout window → skip straight to PIN keypad.
2. Otherwise: scanning animation for 1300ms →
   - Pass (default in the prototype) → green check, hold 550ms, resolve (unlock / execute transaction).
   - Fail (only when explicitly simulated, see Design Tokens/demo flags) → red X, offer "Try Face ID again" and "Use PIN instead".
3. 3rd consecutive fail anywhere → 30-minute Face ID lockout begins, forces PIN entry immediately (with a lockout notice), toast "Face ID locked · use your PIN".
4. Correct PIN (6 digits, compared to the stored PIN) at any point → resolve same as a Face ID pass. Wrong PIN → shake/error state, toast "Incorrect PIN", stays on PIN entry.

**Merchant accept-payment flow (separate from the above — no biometric step):**
Store tab → (first time) Merchant setup → Merchant home → enter amount → Create charge → Merchant wait (QR + 180s countdown) → simulated payment resolves to either Paid or Underpaid → Merchant paid (chime) → auto-returns to Merchant home after 5s. Cancel-order and expiry are alternate exits back to Merchant home.

### Animation & timing reference
| Name | Effect | Duration/Easing |
|---|---|---|
| Screen enter (`sIn`) | translateX(22px)→0, fade in | 260ms ease |
| Overlay/backdrop fade (`fIn`) | opacity 0→1 | 180–200ms ease |
| Bottom sheet (`up`) | translateY(40px)→0 | 260ms ease |
| Loading pulse (`miPulse`) | opacity .35↔1, scale .94↔1 | 1050–1100ms ease, infinite |
| Scan laser sweep (`scanY`) | top 8%→88%→8% | 2200ms ease-in-out, infinite |
| Success pop (`pop`) | scale .4→1.08→1, fade in | 220–450ms ease |
| Face-check centered pop (`popCenter`) | same curve, locked to true center | 400ms ease |
| Token detail expand (`exIn`) | translateY(-8px)→0, fade in | 240ms ease |
| Face-fail shake (`faceShake`) | translateX ∓6px/∓4px wobble | 400ms ease |
| QR tab button laser + icon ripple | continuous sweep + scale pulse | 1800ms ease-in-out, infinite |

### Other timings that affect behavior fidelity
PIN digit auto-advance/compare: 150ms · Face scan duration: 1300ms · Face success hold before resolving: 550ms · Face-fail→lockout PIN switch: 750ms · Transaction broadcast/busy overlay: 1600ms · QR/merchant scan simulation: 2400ms · Merchant order countdown: 180s, simulated payment/underpayment lands ~4500ms in · Toast visible duration: 1800ms.

### Demo-only flags (do not carry into production)
The prototype exposes tweak toggles to preview edge cases — these are authoring aids, not product behavior: force every Face ID check to fail (to preview the PIN-fallback/lockout path), force the merchant order to resolve underpaid, and a configurable network fee. In production there is no "force fail" — real biometric APIs report their own pass/fail.

## State Management
Key state a recreation needs to model:
- `scr`: current screen enum (see full list in Screens above; ~30 values).
- `bio`: `{ enrolled: boolean, attempts: number, lockedUntil: timestamp|0 }` — Face ID enrollment, live failure counter (resets on any success), and the 30-min lockout deadline.
- Entry-lock gate: `locked: boolean`, `lockStage: 'face'|'pin'`, `lockAnim: 'scanning'|'ok'|'bad'`.
- Transaction gate: `bioCheck: null | { kind: 'send'|'swap'|'pay', stage: 'face'|'pin', anim: 'scanning'|'ok'|'bad', pin, pinErr }`.
- `pin` (the stored 6-digit PIN), plus separate in-flight digit buffers per screen (`newPin`/`confirmPinVal`, `signinPin`, `unlockPin`, `bioCheck.pin`).
- `send { to, tok, amt, memo }`, `swap { from, to, amt }`, `pay { name, addr, amount, orderId, tok, expired? }` — the pending transaction being reviewed/confirmed.
- `tokens[]` (symbol, name, glyph, color, balance, usd price, decimals), `txs[]` (activity feed, newest first), `points`, `merchant { setUp, name, addr, verified }`, `mOrder` (active charge being accepted), `mHistory[]`.
- `twoFa`, `theme` (dark/light), `fiat` (display currency).
- Data fetching in a real build: token balances/prices should come from a live wallet/indexer API instead of static mock numbers; conversion rates from a live FX source instead of the static mock rate table.

## Design Tokens

### Color (dark theme, default)
`--bg:#101014` `--bg2:#17171c` `--bg3:#0c0c10` `--line:#26262e` `--line2:#1e1e25` `--tx:#f2f2f4` (primary text) `--mut:#8b8b94` (secondary text) `--gold:#c9a35f` (accent/brand) `--goldT:#15120b` (text on gold) `--up:#34c98e` (positive/success) `--dn:#ff7a6b` (negative/error) `--upBg:#123527` `--dnBg:#3a1d18` `--warn:#e2b25a` `--warnBg:#3a2f16`

### Color (light theme)
`--bg:#f5f4f2` `--bg2:#ffffff` `--bg3:#f5f4f2` `--line:#e5e2dc` `--line2:#ecebe7` `--tx:#17161a` `--mut:#7d7a74` `--gold:#b68235` `--goldT:#ffffff` `--up:#0f9d63` `--dn:#d64530` `--upBg:#e2f4ea` `--dnBg:#fbe7e1` `--warn:#b5831f` `--warnBg:#f7edd6`

Face ID viewfinder background is always near-black (`#08080a`) regardless of theme (it's a camera-view metaphor, not themed chrome).

### Typography
Single family: **Space Grotesk** (weights 400/500/600/700) for everything, including numerals — all monetary/tabular figures use `font-variant-numeric: tabular-nums`. Display total on Home: ~44px integer / ~26px decimals, weight 700, tight letter-spacing (-0.03em). Screen titles: 16px/700. Body: 12–13.5px. Micro-labels/kickers: 9–10px, uppercase, letter-spacing .14em, weight 600, muted color.

### Spacing / radius / shape
Buttons: fully round (pill, `border-radius:99px`). Cards/sheets/inputs: 12–18px radius. Bottom sheets: 18px top corners, 38px bottom corners (drawer-like). Confirm modals: centered card, 18px radius, max-width ~270px. Borders are 1px `--line` throughout; MironPay favors flat/bordered surfaces over shadows — the only real shadow in the whole app is the desktop-preview phone bezel itself (not part of the real design).

### Assets
- `assets/mi-icon-g.png` — app glyph mark, used on loading/pulsing states.
- `assets/mi-lockup-dark-g.png` / `assets/mi-lockup-light-g.png` — full wordmark lockup, theme-swapped, used on Welcome and Home headers.
All included in this package's `assets/` folder at their referenced paths.

## Files
- `DESIGN_SYSTEM.md` — **read this first** — the full design system as a spec: every color token in both themes, the type scale, shape/radius scale, every component and its states, the biometric pattern, motion table, and do/don't rules. Build against these tokens rather than lifting values ad hoc from the HTML.
- `MironPay Design System (standalone).html` — the same design system rendered live (double-click to open): swatches, type at real sizes, every component in both themes, the three biometric states.
- `MironPay App Obsidian (standalone).html` — **the app** — double-click, works fully offline, no server needed.
- `MironPay App Obsidian.dc.html` + `support.js` + `assets/` — the same design reference as separate source files (needs a local web server to open, e.g. `npx serve .`, due to browser CORS restrictions on `file://` + ES modules — not a bug, just don't double-click this one directly).
