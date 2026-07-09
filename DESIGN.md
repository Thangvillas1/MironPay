# MironPay — Design Handoff for Claude Designer

> **Read this first.** This file is the single source of truth for anyone designing UI for MironPay. It covers the design system, app layout, every implemented screen, component inventory, and feature flows. Do not assume anything not written here — ask the developer to clarify.

---

## 1. What is MironPay?

MironPay is a **crypto payment app** — think Venmo but for stablecoins. Users can:
- Hold a multi-wallet (Main USDC, Agent AI, Status)
- Send / receive USDC on-chain (ARC network, Circle wallets)
- Chat with an AI Agent that can execute on-chain transactions on their behalf
- Earn a "Miron Score" (reputation points) for activity
- Swap tokens, view price charts

The app targets **mobile-first** users but also works on desktop (responsive sidebar layout).

---

## 2. Design System

### 2.1 Color Tokens

The app uses **CSS custom properties** defined in `app/globals.css`. There are two themes: dark (default) and light.

**Semantic tokens — use these, not raw hex:**

| Token | Dark value | Light value | Usage |
|-------|-----------|------------|-------|
| `--c-page` | `#070a18` | `#f0eeff` | Page background |
| `--c-panel` | `#12122a` | `#ffffff` | Card / panel background |
| `--c-sidebar` | `#0e0e24` | `#ede9ff` | Sidebar background |
| `--c-text` | `#e8edf8` | `#0a0718` | Primary text |
| `--c-muted` | `#8090b8` | `#3d4870` | Secondary / helper text |
| `--c-muted2` | `#4a5a7a` | `#6070a0` | Placeholder / disabled text |
| `--c-border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.10)` | Dividers, card borders |
| `--c-input` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.05)` | Input background |
| `--c-success` | `#22c55e` | `#15803d` | Positive amounts, success states |
| `--c-purple-accent` | `#a78bfa` | `#5b21b6` | Primary accent / brand color |
| `--c-purple-light` | `#c084fc` | `#6d28d9` | Hover / active accent |
| `--c-blue-accent` | `#60a5fa` | `#1d4ed8` | Links, info |

**Tailwind class aliases (use in JSX):**

| Class | Maps to |
|-------|---------|
| `bg-mp-bg` | Page background |
| `bg-mp-card` | Card background (includes shadow) |
| `bg-mp-sidebar` | Sidebar background |
| `text-mp-primary` | `#7c6bf5` — active nav, primary actions |
| `text-mp-muted` | `#7880a6` — muted text |
| `text-mp-text` | `#e8edf8` — body text |
| `bg-mp-primary` | Primary purple button background |

### 2.2 Typography

- Font family: **Geist Sans** (sans) + **Geist Mono** (mono) — loaded via Next.js font system
- No custom type scale — uses Tailwind defaults (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-4xl`)
- Balance / amount displays: `font-bold` or `font-semibold`, often `tabular-nums`
- Wallet addresses: `font-mono text-xs`

### 2.3 Wallet Card Colors

Each wallet card has a unique color variant (CSS class):

| Card | CSS class | Accent color |
|------|-----------|-------------|
| Main wallet (USDC) | `wallet-card-blue` | `#1a56db` border, blue glow |
| Agent AI wallet | `wallet-card-purple` | `#7c3aed` border, purple glow |
| Status wallet | `wallet-card-cyan` | `#06b6d4` border, cyan glow |

Cards have hover: `translateY(-3px) scale(1.02)` + intensified glow.

### 2.4 Spacing & Shape

- Card border-radius: `rounded-2xl` (16px) for wallet cards, `rounded-xl` (12px) for smaller cards
- Standard card padding: `p-5` (20px)
- Standard gap between sections: `gap-3` or `gap-4`
- Input border-radius: `rounded-xl`

### 2.5 Motion

- Transitions: `transition-colors`, `transition-all duration-200`
- Hover scale: `hover:scale-105` for icon buttons
- Modal open: slide-up from bottom (mobile), fade (desktop)
- No heavy animation — keep it subtle and fast

---

## 3. Layout Architecture

### 3.1 Responsive Structure

```
Desktop (lg+):                    Mobile:
┌──────────┬──────────────────┐   ┌──────────────────┐
│  Sidebar │                  │   │                  │
│  200px   │   Page content   │   │   Page content   │
│  fixed   │                  │   │                  │
│          │                  │   ├──────────────────┤
└──────────┴──────────────────┘   │   Bottom Tab Bar │
                                   └──────────────────┘
```

- `app/(app)/layout.tsx` wraps all authenticated pages
- Sidebar: `lg:block hidden`, 200px fixed left
- Content: `lg:ml-[200px]`
- Bottom Tab Bar: `lg:hidden fixed bottom-0` — 56px tall

### 3.2 Navigation Tabs (Bottom Bar + Sidebar)

| Tab | Route | Status |
|-----|-------|--------|
| Wallet | `/dashboard` | **Active** |
| Contacts | `#` | Placeholder (disabled, opacity 25%) |
| Agent | `/agent` | **Active** |
| Leaderboard | `#` | Placeholder (disabled) |
| Settings | `#` | Placeholder (disabled) |

Active tab: `text-mp-primary` (`#7c6bf5`)
Disabled tab: `opacity-25 text-mp-muted`

---

## 4. Route & Page Inventory

### 4.1 Route Groups

```
app/
  (auth)/              # Unauthenticated — centered layout, no nav
    login/             → /login
  (onboarding)/        # Post-login setup — centered layout, no nav
    onboarding/username/
    onboarding/confirm-username/
    onboarding/setup-pin/
  (app)/               # Authenticated — sidebar + bottom tab
    dashboard/         → /dashboard  (main wallet hub)
    agent/             → /agent      (AI chat)
    wallet/            → /wallet
    send/              → /send
    receive/           → /receive
    swap/              → /swap
    token/[symbol]/    → /token/USDC etc.
  auth/callback/       # OAuth callback — loading screen only
```

### 4.2 Page Details

> **Important — two parallel implementations exist for Send/Receive/Swap.** `SRSModal.tsx` (opened from `/dashboard` and `/wallet`) is the current, richer, primary flow — it has inline PIN setup, the 4-phase progress checklist, memo support, and is what real users hit first. The standalone routed pages (`/send`, `/receive`, `/swap`) are an older/parallel implementation with simpler UI (no 4-phase checklist, separate `PinVerifyModal`, but the `/swap` page does have the richer user-adjustable slippage UI that the modal lacks). Both call the same backend endpoints. **Design both, but treat `SRSModal` as the canonical version when the two disagree.**

#### `/login`
- Centered card on dark background
- Logo / brand mark at top
- Single CTA: "Sign in with Google" button (Google icon + text)
- States: idle → loading ("Redirecting...") → error (inline message above button)
- No form fields

#### `/onboarding/username`
- Step 1 of 3
- Single text input with real-time validation
- Validation states: idle / checking / available (green) / taken (red) / invalid (red)
- Progress indicator (1/3)
- "Continue" button: disabled until username is available

#### `/onboarding/confirm-username`
- Step 2 of 3
- Displays `@username` in large bold text
- Warning banner: "Your username cannot be changed after this step."
- Back + Confirm buttons

#### `/onboarding/setup-pin`
- Step 3 of 3
- 6-dot PIN indicator (filled = entered, empty = remaining)
- Custom numpad (1-9, 0, backspace)
- Two phases: Enter PIN → Confirm PIN
- Error state: "PINs don't match" in red, resets

#### `/dashboard` — Main Hub
This is the most complex page. Sections:

**Header strip:**
- Left: avatar + "Hi, @username"
- Right: theme toggle button

**Wallet cards (horizontal scroll on mobile):**
Three cards side by side:
1. **Main Wallet** (blue) — USDC balance, wallet address truncated, sparkline chart
2. **Agent AI Wallet** (purple) — Agent balance, daily spent / daily limit bar
3. **Status Wallet** (cyan) — Status token balance

**Quick actions row:**
Send · Receive · Swap — icon + label, tappable → opens `SRSModal` in the respective mode

**Agent Wallet actions** (separate from the quick-actions row above, live on the Agent Wallet card): **Fund** (Main→Agent), **Withdraw** (Agent→Main), **Limit** (set daily spend cap), **Agent Info** (ERC-8004 reputation) — each opens its own modal, described in 6.5–6.7 below. These are NOT part of Send/Receive/Swap; they move funds between the user's own two wallets or configure the AI agent.

**Miron Score card** — collapsible panel showing score, streak, XP progress bar

**Recent Transactions** — list with "View All" → opens `TransactionHistoryModal`

**Token holdings** — list of tokens with price + 24h change

**AI agent chat** — inline on dashboard; agent-executed transactions render a compact `TxResultCard`-style message in the thread (a third, distinct notification style — see 7.2)

#### `/agent` — AI Chat
- Chat interface (messages from user + assistant)
- Input bar at bottom with send button
- Each assistant message shows cost in USDC
- If the AI executes a transaction, a `TxResultCard` appears inline in the chat
- Typing indicator while AI responds

#### Send (`SRSModal` mode `'send'`, primary — also standalone `/send` page)
Step order:
1. **Amount step** — recipient input (`@username` or `0x…`, debounced resolve against Supabase `profiles`, live badge: resolving / found / not found / invalid) → big numeric amount input + token-picker button → quick chips `10% / 25% / 50% / Max` → optional **Memo** field (80 chars, note: "recorded on-chain and visible to recipient") → Continue.
2. **Token step** (if opened from token picker) — list with logo, verified badge, balance, USD value.
3. **Confirm step** — review card: amount, recipient (avatar + username/address), network ("ARC · Circle"), memo if present, network fee estimate, total. Footer: "You'll authorize this with your PIN" (existing PIN) or "You'll create a PIN to authorize this transfer" (first time).
4. **PIN step** — `setup_pin`→`confirm_pin` (first time) or `pin` (returning user), shared 6-digit `PinPad`, auto-advances 300ms after 6th digit.
5. **Progress step** — 4-phase checklist: *Signing transaction → Broadcasting to ARC → Confirming on-chain → Settled*. First 3 phases auto-tick every 750ms (cosmetic); phase 4 is gated on the real API result (polls up to 30s) — the last step is truthful even though the first three are simulated pacing.
6. **Success** — checkmark, "Sent {amount} {symbol}", memo chip if any, "View on ARC Explorer" link, Done.
7. **Error** — red X, message, optional failed-tx explorer link, Close.

Standalone `/send` page is a simpler variant: no 4-phase checklist (just a spinner + "Broadcasting on ARC Testnet..."), PIN via separate `PinVerifyModal`.

#### Receive (`SRSModal` mode `'receive'`, primary — also standalone `/receive` page and a QR card on `/wallet`)
- Address is **blurred by default** with a "Tap to reveal" overlay (privacy).
- Revealed state: QR code (white background) + `@username` + truncated address with copy button.
- **Auto-hide after 30s** — live countdown badge, turns red under 10s, then re-blurs.
- Actions: **Copy** (clipboard, 2s "copied" confirmation), **Share** (native share sheet, falls back to copy).
- No PIN — read-only flow.

#### Swap (`SRSModal` mode `'swap'`, primary — also standalone `/swap` page)
Only **USDC ⇄ EURC** is supported (no other token pairs yet).
1. **Form step** — "You pay" card (amount, token-select, `25/50/75/Max` chips) → flip button (⇅) → "You receive" card (live quote, 700ms debounce) → rate/slippage summary line. **The modal hardcodes 15% slippage as a static badge — no user control here.** → Continue.
2. **PIN step** — same shared flow as Send.
3. **Progress step** — same 4-phase pattern, labels: *Signing swap → Routing on ARC → Confirming on-chain → Settled*.
4. **Success** — "Swap complete!", `{amountIn} {tokenIn} → {amountOut} {tokenOut}`, explorer link, Done.
5. **Error** — "Transaction Failed" screen.

Standalone `/swap` page has the **richer, user-facing slippage UI the modal lacks** — worth carrying into the modal design:
- Slippage presets **5% / 10% / 15% / Custom** (default 15%, comment in code: "testnet liquidity is thin").
- Quote panel: Rate, Minimum received, Network fee, Slippage selector.
- Dedicated **"Slippage too low" recovery state** — amber warning box when the swap reverts for insufficient output, with quick-bump retry buttons (10%, 15%, custom).

#### `/token/[symbol]`
- Token detail: price, 24h change, market cap
- `PriceChart` component (sparkline / candlestick)
- Buy / Sell actions

---

## 5. Component Inventory

These components exist and are implemented. Design them, don't recreate the logic.

| Component | File | Purpose |
|-----------|------|---------|
| `SRSModal` | `components/SRSModal.tsx` | **Primary** unified Send/Receive/Swap modal — all steps, inline PIN setup, 4-phase progress, memo, success/error. ~The most important component to design well. |
| `Sidebar` | `components/Sidebar.tsx` | Desktop left nav |
| `BottomTabBar` | `components/BottomTabBar.tsx` | Mobile bottom nav (5 tabs) |
| `PinVerifyModal` | `components/PinVerifyModal.tsx` | Legacy PIN entry modal, used only by standalone `/send` and `/swap` pages (client-side hash compare, no server call) |
| `TransactionHistoryModal` | `components/TransactionHistoryModal.tsx` | Full tx list, slide-up. Icon by type/memo, date, +/- amount, tap → detail |
| `TransactionDetailModal` | `components/TransactionDetailModal.tsx` | Single tx detail sheet: amount, state badge, From/To (resolves username), memo callout, date/network/status/hash, fee/total breakdown, explorer link |
| `TokenSelectSheet` | `components/TokenSelectSheet.tsx` | Standalone bottom-sheet token picker (search) — distinct from `SRSModal`'s inline token step |
| `MironScoreCard` | `components/MironScoreCard.tsx` | Compact score widget: ring progress, level emoji, streak flame, rank, per-level "Unlock" badge |
| `MironScorePanel` | `components/MironScorePanel.tsx` | Expanded panel: own score/level/streak/rank + top-N leaderboard |
| `DailyLoginTracker` | `components/DailyLoginTracker.tsx` | Invisible mount, fires daily-login score once/day |
| `PriceChart` | `components/PriceChart.tsx` | SVG sparkline / price chart on token detail page |
| `VerifiedBadge` | `components/VerifiedBadge.tsx` | Checkmark badge (verified token / verified agent) |
| `AgentAvatar` | `components/AgentAvatar.tsx` | AI agent avatar (glow / excited / status-dot variants) |
| `ThemeToggle` | `components/ThemeToggle.tsx` | Dark/light toggle button |

**Not-yet-componentized patterns worth noting for design consistency:** `WalletCard` (gradient card, balance, truncated address+copy, status dot — used for Main/Agent/Status), `DonutChart` (portfolio breakdown, Main+Agent combined, on `/wallet`), `StatusCard` (account level + agent spend bar + PIN status), `SparklineChart`/`MiniLineChart` (inline SVG on dashboard cards).

---

## 6. Feature Flows (Logic Summary for UI Design)

There are **two wallets per user**: Main Wallet (EOA, pays its own gas, protected by PIN) and Agent Wallet (Circle SCA, gasless, powers the AI agent, no PIN). Send/Receive/Swap operate on the Main Wallet (or on the Agent Wallet when the AI agent executes on the user's behalf via the same swap endpoint). Fund/Withdraw/Limit move value or configure the Agent Wallet itself and are a distinct feature from Send/Receive/Swap.

### 6.1 Send Flow (`SRSModal` mode `'send'`)
```
tap "Send" → SRSModal opens
  → [amount] recipient (@username or 0x…, live resolve) + amount + %-chips + optional memo → Continue
  → [token]  (optional) pick token from list
  → [confirm] review: amount, recipient, network, memo, fee, total
  → [setup_pin → confirm_pin]  (first time)  OR  [pin]  (returning user)
  → [progress] 4-phase checklist:
      Signing transaction → Broadcasting to ARC → Confirming on-chain → Settled
      (phases 1–3 auto-tick every 750ms for pacing; phase 4 blocks on the real tx result, polled up to 30s)
  → [success] "Sent {amount} {symbol}" + memo chip + ARC Explorer link
  → [error]   failure message + explorer link if a hash exists
```
Backend: `POST /api/wallet/transfer`. On success: Miron Score +2 (`addScore('send')`).

### 6.2 Swap Flow (`SRSModal` mode `'swap'`)
```
tap "Swap" → SRSModal opens (USDC ⇄ EURC only)
  → [form] "You pay" (amount, token, %-chips) ⇅ "You receive" (live quote, 700ms debounce)
           rate + fixed "15% slippage" badge (not user-adjustable in the modal) → Continue
  → [setup_pin → confirm_pin] or [pin]
  → [progress] Signing swap → Routing on ARC → Confirming on-chain → Settled
  → [success] "{amountIn} {tokenIn} → {amountOut} {tokenOut}" + explorer link
  → [error]   "Transaction Failed"
```
Standalone `/swap` page additionally supports **user-adjustable slippage (5/10/15%/custom)** and a **"slippage too low" recovery banner** with quick-bump retry — a pattern worth carrying into the modal design since testnet liquidity is thin and this failure is common.
Backend: `GET /api/wallet/swap/estimate` (quote) + `POST /api/wallet/swap` (execute — handles ERC20 approve, quote refresh/retry, detects the slippage-revert selector). Same endpoint also serves Agent-Wallet-initiated swaps (AI agent "execute" action). On success: Miron Score +3.

### 6.3 Receive Flow (`SRSModal` mode `'receive'`)
```
tap "Receive" → SRSModal opens
  → address blurred by default, "Tap to reveal" overlay
  → revealed: QR code + @username + truncated address, Copy / Share buttons
  → auto re-blurs after 30s (countdown badge, red under 10s)
```
No PIN, no backend call — pulls from already-loaded profile/wallet state.

### 6.4 AI Agent Flow
```
/agent (or dashboard chat) → user types natural language ("send 5 USDC to @alice")
  → AI responds with intent
  → if it's a transaction: executes directly through the Agent Wallet — NO PIN
    (Agent Wallet is gasless/no-PIN by design; only the Main Wallet requires PIN)
  → inline compact TxResultCard-style message in the chat thread: success/fail + amounts + explorer link
  → each AI message/action costs 0.005 USDC, deducted from Agent Wallet balance
```

### 6.5 Fund (Main → Agent Wallet) — Dashboard modal, not `SRSModal`
```
Agent Wallet card → "Fund" → modal opens
  → [form] amount input, USDC only, %-chips (25/50/75/100% of Main balance) → "Deposit USDC"
  → [pending] single spinner, "Processing deposit... Transferring {amt} USDC → Agent Wallet"
  → [success] "Deposit Submitted!" + amount + "Will appear in ~30 seconds" + tx id
  → [error]   "Deposit Failed" + Cancel / Try again
```
Note: this is a **3-phase spinner flow** (form → pending → success/error), NOT the 4-phase checklist used by Send/Swap — do not reuse the itemized-checklist visual for this modal, a single spinner state is correct here.
Backend: `POST /api/agent/wallet/deposit` (min 0.01 USDC).

### 6.6 Withdraw (Agent → Main Wallet) — Dashboard modal
Same 3-phase pattern as Fund, plus an extra **token-select sub-step** first (Agent Wallet can hold non-USDC tokens). Backend: `POST /api/agent/wallet/withdraw`.

### 6.7 Limit (Agent Wallet daily spend cap) — Dashboard modal
```
Agent Wallet card → "Limit" → quick-set chips (1/5/10/50 USDC) or custom
  → Save → writes to DB immediately (fast path), then fire-and-forget on-chain tx
  → success screen shows "✓ On-chain" if the on-chain tx confirmed, or "⚠ Database only" if not
```
The **maximum** the user can set is capped by their Miron Score level: Newcomer 5 / Builder 10 / Trader 20 / Elite 50 USDC/day. Backend: `PUT /api/agent/wallet/limit`.

### 6.8 Miron Score
- Points: send +2, swap +3, agent tx +1, deposit +1, daily login +0.5. Streak multiplier: 1.2× at 7 days, 1.5× at 30 days.
- Levels by score: Newcomer(0) → Builder(100) → Trader(300) → Elite(600) — each level raises the Agent Wallet's max daily limit and unlocks perks (Trader: -0.1% swap fee; Elite: IDO early access).
- Displayed as score + level + "🔥 X day streak" + rank (`MironScoreCard`/`MironScorePanel`), plus a public leaderboard.
- Distinct from **on-chain agent reputation** (ERC-8004 `ReputationRegistry`, shown in dashboard's "Agent Info" modal) — that's feedback-based reputation for the AI agent's actions, not the user's own activity score. Don't conflate the two in design — they're separate widgets with separate data sources.

---

## 7. Key UX Patterns

### 7.1 PIN
**Three separate PIN implementations currently exist in code — flagging for awareness, not something to visually differentiate:**
1. `PinVerifyModal.tsx` (standalone `/send`, `/swap` pages) — client-side hash compare.
2. Inline `PinPad` inside `SRSModal` (primary flow) — server-verified via `/api/auth/pin/set` and `/api/auth/pin/verify`, three states: `setup_pin` (first creation) → `confirm_pin` (re-enter) → `pin` (verify to authorize).
3. Onboarding `setup-pin` page — a third variant with its own hash format.
Visually these should all converge on **one PIN pad design**: 6-dot indicator + numpad (1-9, 0, backspace), auto-advance on 6th digit, shake + red message on error, bottom sheet on mobile / centered modal on desktop.
The **Agent Wallet never asks for PIN** (Fund/Withdraw/Limit modals and AI-agent-executed transactions) — only the Main Wallet (Send, Swap, standalone pages) requires it. Make this distinction legible in the UI (e.g. a small "Gasless · No PIN" badge already used on the Agent page).

### 7.2 Transaction Notifications — two distinct patterns, do not merge
1. **4-phase checklist** (Send & Swap, inside `SRSModal` only): itemized list, numbered/spinner/checkmark per row. Labels differ by action (Send: Signing/Broadcasting/Confirming/Settled; Swap: Signing/Routing/Confirming/Settled). First 3 steps auto-advance for pacing; the last is truthful (gated on the real API response).
2. **3-phase spinner** (Fund/Withdraw/Limit, dashboard modals): a single spinner + status text, no itemized list — `form → pending → success/error`.
3. A **third, compact style** exists inline in the AI agent chat thread (`TxResultCard`-style message: colored header, paid/received rows, explorer link) — smaller footprint, lives inside a chat bubble rather than a modal.
All three funnel into a similar terminal state: icon + headline + key-value summary + optional ARC Explorer link (`testnet.arcscan.app/tx/{hash}`) + primary action button.

### 7.3 Token Select
Two implementations: `SRSModal`'s inline token step (simpler, embedded in the modal's own step flow) and the standalone `TokenSelectSheet` bottom sheet (search input, logo/symbol/name/balance) used by the older pages. Currently only USDC/EURC and a small token set are live — design should not assume a long token list.

### 7.4 Empty States
- No transactions: "No transactions yet. Send or receive USDC to get started."
- Loading: skeleton shimmer (purple-tinted on dark theme)

---

## 8. What Needs Design (not yet styled)

- [ ] `SRSModal` — **primary target**, all steps (amount/token/confirm/PIN/progress/success/error) × Send/Receive/Swap modes
- [ ] Fund / Withdraw / Limit modals (Agent Wallet, dashboard) — currently plain 3-phase spinner flow
- [ ] Standalone `/send`, `/receive`, `/swap` pages — older parallel flow, lower priority than `SRSModal` but still live
- [ ] `/wallet` page — portfolio donut chart + two wallet cards + holdings + recent activity
- [ ] `/token/[symbol]` — token detail page
- [ ] `/agent` page — chat UI + inline `TxResultCard`-style messages
- [ ] `TransactionDetailModal` — needs richer layout
- [ ] `MironScorePanel` — expandable section, needs visual hierarchy
- [ ] Agent Info modal (ERC-8004 reputation) — distinct widget from Miron Score, don't conflate
- [ ] Onboarding pages — functional, needs brand treatment
- [ ] Empty states — missing illustrations/copy
- [ ] Slippage recovery banner (swap) — amber warning + quick-bump retry, currently only on standalone `/swap` page

---

## 9. Constraints for CD

1. **Do not change component props or logic** — only style (className, inline style, SVG icons, layout within component)
2. **Tailwind v4** — no `tailwind.config.js`. Add new tokens only in `app/globals.css` under `@theme inline` or as CSS custom properties in `:root`
3. **Dark theme is default** — light theme support is required for all new UI (use `--c-*` CSS vars or `:root.light` overrides)
4. **Mobile-first** — design for 375px first, then 1024px+
5. **No new packages** — use existing: Tailwind, inline SVG icons, `qrcode.react`, `recharts` (if chart needed). Do not add icon libraries.
6. **No middleware.ts** — routing logic lives in `proxy.ts`, do not touch it
7. **Geist font only** — no Google Fonts or other font imports
8. **Keep component file structure** — do not reorganize folders

---

## 10. How to Start

When the developer (me) hands you a task, I will specify:
- Which page or component to style
- Any reference design (screenshot or description)
- Priority: mobile or desktop first

Read this file before every session so you have full context. If anything is unclear, ask before implementing.
