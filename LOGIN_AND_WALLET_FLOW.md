# MironPay — Login & Wallet Creation Flow (spec for redesign)

This document describes the **exact functional flow and logic** of sign-in + account/wallet creation. Hand this to a designer (or Claude for design) as-is — the goal is a new UI for these same steps/states, not new behavior. Nothing here is Vietnamese-only; all UI copy must ship in English per project convention.

---

## 1. High-level flow

```
Landing page (/)
  → "Sign in" button → Google OAuth (Google-hosted screen, not ours)
  → /auth/callback (silent, auto-redirecting page)
       ├─ existing user (has username) → /dashboard
       └─ new user (no username yet)   → /onboarding/username
                                              ↓
                                        /onboarding/confirm-username
                                              ↓
                                        /onboarding/setup-pin
                                              ↓ (creates wallets here)
                                           /dashboard
```

Every onboarding step (username / confirm-username / setup-pin) individually checks for a valid Supabase session on mount and bounces to `/login` if missing. `confirm-username` and `setup-pin` also require a `?username=` query param carried over from the previous step — if it's missing (e.g. user refreshes directly on that URL), they bounce back to `/onboarding/username`. **This is a real fragility worth fixing in redesign**: the username should ideally be re-derivable from a pending-signup record instead of only living in the URL.

---

## 2. Screen-by-screen spec

### 2.1 Landing page sign-in trigger (not a dedicated screen)
- Button copy: "Continue with Google" (Hero/CTA) or "Sign in" (Nav).
- On click: calls `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '<origin>/auth/callback' })`, then browser navigates to Google's OAuth URL.
- Visual states while waiting: idle → busy ("Connecting…") → done ("Opening your wallet…") — this is client-side theater since the browser is about to navigate away entirely; keep some sense of state feedback for the ~1s before redirect.

### 2.2 `/auth/callback` — silent redirector, no real "screen"
- No user input. Purpose: exchange Google's OAuth `code` for a Supabase session, then route onward.
- Logic:
  1. If URL has `?error=...`, show the error message + a "Back to sign in" action (→ `/login`). **This is the only real UI state on this page** — everything else is instant redirect.
  2. Else, exchange `code` for a session via Supabase.
  3. Look up `profiles.username` for this user.
     - Has a username → go to `/dashboard` (returning user).
     - No username → go to `/onboarding/username` (new user).
- Design need: a lightweight "signing you in…" loading state (currently just plain text) — this is the very first thing a brand-new user sees post-Google, so it should feel branded, not blank.

### 2.3 `/onboarding/username` — pick a handle
**Purpose**: choose the `@handle` people will send money to.
**Inputs**: single text field, lowercased automatically, allowed characters `a-z 0-9 _`, 3–20 chars (client strips invalid characters as you type — never shows an invalid character in the box).
**Validation** (debounced 500ms after typing stops):
  - Format: length 3–20, charset `a-z0-9_` only, not on a reserved-word blacklist (`admin`, `mironpay`, `wallet`, etc. — full list exists in code, don't need to reproduce in design).
  - Uniqueness: live query against existing usernames.
**States to design for**: `idle` (nothing typed) → `validating` ("Checking…") → one of: `invalid` (format error, shows the specific reason), `taken` ("@x is already taken"), `available` ("@x is available").
**Primary action**: "Continue" — disabled unless status is `available`. On click → `/onboarding/confirm-username?username=<value>`.
**Design note from current build**: avoid layout shift — don't conditionally mount/unmount a large "preview" element as the user types; reserve its space up front.

### 2.4 `/onboarding/confirm-username` — irreversible confirmation step
**Purpose**: make sure the user is sure — **username cannot be changed later**, so this is a deliberate confirm gate, not a formality.
**Input**: none, just displays the chosen `@username` (read from the `?username=` query param) big and clearly.
**Content**: one warning message that this can't be changed after confirming.
**Actions**: "Back" (→ `/onboarding/username`, so they can retype) and "Confirm" (→ `/onboarding/setup-pin?username=<value>`).
**Design note**: needs to *feel* consistent with the username step it's sandwiched between (same icon-badge treatment, same text scale for the `@handle` display — currently these two steps show it at different sizes, fix that).

### 2.5 `/onboarding/setup-pin` — set the 6-digit transaction PIN, then wallets get created
**Purpose**: this PIN is what authorizes every future money-moving action (send, swap, withdraw) — it's a security step, not a cosmetic one. Wallet creation is bundled into this same screen's completion, invisibly.
**Input**: 6-digit PIN via an on-screen numpad (0–9 + backspace), no physical keyboard entry.
**Phases** (all on the same screen/route, no URL change):
  1. `entering` — "Enter a 6-digit PIN." User taps 6 digits (shown as filled/empty dots, never the digits themselves).
  2. `confirming` — "Confirm your PIN." User re-enters the same 6 digits.
     - Mismatch → error message, resets back to `entering`, must start over.
  3. `saving` — "Setting up…" — this is where the real backend work happens, **can take a few seconds**, needs a proper loading state (currently just static text, no spinner/progress):
     a. Hash the PIN (`sha256(userId:pin:"miron")`) and save it + the chosen username to the user's profile.
     b. Create **two blockchain wallets** via Circle (Arc testnet, EOA type): a **Main Wallet** (the user's own money) and an **Agent Wallet** (money the AI agent is allowed to spend on the user's behalf, under a separate daily limit set elsewhere). Both addresses get saved to the profile.
     c. Create the user's `wallets` row (starting balance 0 USD).
  4. On any failure at any of those steps → show the specific error, drop back to `entering` so they can retry the whole PIN (current behavior — a bit harsh since a wallet-creation failure shouldn't force a full PIN re-entry, worth reconsidering in redesign but not required).
  5. On success → `/dashboard`, fully onboarded.
**Design note**: phase 3 (`saving`) is the most important state to make feel trustworthy and premium — it's literally "we are creating your on-chain wallet right now," which is a bigger deal than a generic "Loading…" and should probably say something to that effect and take it seriously visually (this is the one moment in onboarding where real blockchain infrastructure is being provisioned).

---

## 3. Cross-cutting design requirements

- **Visual consistency with the rest of the product**: the landing page, dashboard and wallet screens all use a dark-purple/indigo gradient aesthetic with glowing shadows (`--grad-primary`, `--glow-primary` tokens) and rounded gradient icon badges. The current login/onboarding screens are flat/plain and look like a different, cheaper product — the redesign should bring them in line with that gradient/glow language, both dark and light theme (the whole app supports a theme toggle; every screen must render correctly in both).
- **Icon badge presence should be consistent** across all 4 onboarding-adjacent screens (login, username, confirm-username, setup-pin) — either all of them get a badge icon or a clear intentional reason why some don't.
- **Text scale for the same piece of data** (the `@username`) should match across the username and confirm-username screens.
- **English only** — no Vietnamese strings anywhere in these screens (this was already fixed once this session; if design mockups introduce new copy, keep it English).
- **PIN entry must never render the actual digits on screen** (dots only) — this is a security requirement, not a style choice.
- **Do not fabricate stats/social proof** on these screens (e.g. don't invent "10,000+ wallets created" — this product has no real user traction yet).

---

## 4. What's explicitly out of scope for this redesign

- The Google OAuth consent screen itself (the "Choose an account" page showing `xxx.supabase.co`) is rendered by Google, not by us — cannot be reskinned. Fixing that requires backend infra work (Supabase custom domain / Google Cloud Console branding), not a UI redesign.
- Whether wallet creation should happen at PIN-setup time vs. lazily on first transaction — that's a product/logic decision, not covered here; this doc assumes the current flow stays as-is.
