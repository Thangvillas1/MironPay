# Handoff: MironPay PWA — Full Mobile Flow

## Overview
Complete mobile-app flow for MironPay (stablecoin wallet + AI payments agent), designed as an installable PWA per `PWA_DESIGN_BRIEF.md` (included). Covers: splash → Google sign-in → onboarding (username, confirm, PIN setup, complete) → authenticated app (Dashboard, Wallet, Agent chat, Launchpad, Settings, Leaderboard, Send, Receive, Scan-to-pay QR) with a persistent bottom tab bar. Dark + light themes, 3 device-size presets, and 2 Dashboard layout variants (Cards / Compact).

## About the design files
The files in this bundle are **design references built as an HTML/React prototype** (a single Design Component host page plus supporting `.jsx` screen files run via in-browser Babel) — they are prototypes showing intended look, structure and interaction, **not production code to import into the app as-is**. Recreate these designs in the target codebase's real environment: Next.js (App Router, per the repo structure referenced in `PWA_DESIGN_BRIEF.md`), using its existing component patterns, Tailwind/CSS setup, and state management (not this prototype's plain `React.useState` + inline styles) — apply the codebase's existing patterns rather than copying the prototype's code structure.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and component structure are final and grounded in the MironPay design-system tokens (see `tokens/*.css`). Recreate pixel-for-pixel using the values below and in the token files — do not restyle or guess new values.

## How to view the prototype
`MironPay PWA Prototype.dc.html` is a **Design Component** — it depends on a small runtime script (`support.js`) that this design tool serves automatically and that is **not** bundled in this zip, so opening the `.dc.html` file directly on your machine will not render it. To click through the live version, view it inside the design project itself (ask for the project link), or treat the `.jsx` screen files + this README as the spec and rebuild directly in the target codebase. The `_ds/` folder and `tokens/*.css` included here are the real design-system source (colors/type/spacing/effects) — those work as static references regardless.

## Screens / views

### 1. Splash (`PwaScreens.jsx` → `SplashScreen`)
- Full-bleed radial sapphire glow on `#070b15`, centered brand mark (`assets/logo-mark.svg`, 88×88) with drop-shadow, wordmark "Miron**Pay**" (Pay in `#8487F5`/`#5654E2` light), 24px/700 weight.
- Tap anywhere to continue → Login.

### 2. Login (`LoginScreen.jsx`)
- Centered column, brand mark 72×72, H1 28px/700 "Miron**Pay**", subhead 15px `var(--c-muted)` max-width 260px.
- Single white "Sign in with Google" button (secondary variant, full-width, max-width 320px) with multicolor Google "G" icon; shows "Redirecting…" + spinner on click, then routes to onboarding after 1.1s.
- Legal footer text 12px `var(--c-muted2)`.

### 3. Onboarding — Username (`OnboardingScreens.jsx` → `UsernameScreen`)
- `AuthShell` pattern: centered card, eyebrow "Bước 1/3" (11.5px, 700, uppercase, purple-accent), H1 23px/700, sub 14px muted.
- `Input` component, `@` prefix, validation state (error under 3 chars, valid ≥3), helper text swaps accordingly.
- Primary CTA "Tiếp tục" disabled until valid. Back button top-left (38×38, rounded 12px).

### 4. Onboarding — Confirm username (`ConfirmUsernameScreen`)
- Eyebrow "Bước 2/3", centered Avatar (64px) + `@handle` + VerifiedBadge, copy warns handle can't change after this step. CTA "Xác nhận & tiếp tục".

### 5. Onboarding — Setup PIN (`SetupPinScreen`)
- Eyebrow "Bước 3/3", two-phase numeric entry (enter, then confirm) using `PinDots` + a 3×4 numpad (58px keys, 16px radius, `var(--c-input)` bg). Mismatch → red error text + PinDots shake state, resets to phase 1.

### 6. Onboarding — Complete (`OnboardingCompleteScreen`)
- Success icon (76px circle, success-tinted), H1 "Ví của bạn đã sẵn sàng", body copy referencing Main Wallet + Agent Wallet creation on ARC network. CTA "Vào MironPay".

### 7. Dashboard / Home (`DashboardScreen.jsx`)
- Header: avatar (42px, gradient ring wrapper for a premium touch) + "Welcome back / @handle", theme-toggle icon button top-right.
- **Total balance hero**: glass card, `var(--radius-xl)` (20px), gradient tint + ambient radial glow blob, `var(--shadow-lg)` + `var(--glow-blue)`, 44px/600 tabular balance, +5.2% success pill, "Across 3 wallets · ARC network" mono caption.
- **Quick-pay QR CTA** (new): full-width gradient button (`var(--grad-primary)`, `var(--glow-primary)`), QR icon in a translucent 36px chip, two-line label "Thanh toán nhanh bằng QR / Quét mã để trả tiền tức thì", trailing chevron. Routes to Scan & Pay.
- Wallet cards row (horizontal scroll, 3 `WalletCard`s: Main/blue, Agent/purple with daily-limit bar, Status/cyan) — **or**, in "Compact" layout variant, a stacked list of 3 rows (dot + name + balance) inside one panel.
- Quick actions: Send / Receive / Swap / Top Up (icon buttons) — or compact icon+label 4-up row in Compact variant.
- Miron Score card (score, level, streak with 🔥, XP bar).
- Recent activity list (glass panel, per-row icon/name/sub/amount).
- Holdings list (`TokenRow` × 3: USDC/ETH/BTC).

### 8. Wallet (`WalletScreen.jsx`)
- Full detail per wallet: `WalletCard` full-width + Send/Receive/Swap button row underneath, for all 3 wallets. Holdings list below.

### 9. Agent chat (`AgentScreen.jsx`)
- Glass header (agent avatar gradient circle, name, "Online · on-chain ready" status dot).
- Message bubbles: user (gradient bg, bottom-right radius 4px), assistant (glass bg, bottom-left radius 4px), per-assistant-message USDC cost caption (mono, 10.5px).
- Transaction result card inline (amount/to/hash rows) after a send-intent message + PIN confirm.
- Suggestion chips row, pill input bar (glass) + circular send button.

### 10. Send (`SendScreen.jsx`)
- Header with back button. Recipient `Input` (@ prefix, verified helper), large amount entry ($ + editable number, USDC token pill), quick-amount chips (10/25/50/100), fee estimate row.
- On submit → PIN sheet → 4-phase on-chain progress list (Fund → Withdraw → Send → Deposit, sequential checkmarks) → success screen with tx hash link.

### 11. Receive (`ReceiveScreen.jsx`)
- Badge "ARC Network · Circle", QR module (white card, mock deterministic QR render), address row with copy button (turns success-green + checkmark on copy), Done button.

### 12. Scan & Pay — Quick QR pay (`ScanPayScreen.jsx`, new)
- Scanner mode: 240×240 viewfinder with animated scan-line + corner brackets over a QR icon; tap-to-simulate a successful scan (demo only — wire to a real camera/QR-decode lib in production). "Nhập @handle thủ công" fallback link.
- Manual mode: recipient + amount inputs.
- Confirm mode: recognized-amount summary, fee row, "Xác nhận trả $X" → PIN sheet → success screen (matches Send's success pattern).

### 13. Launchpad (`LaunchpadScreen.jsx`)
- List of IDO cards: token avatar (gradient circle + initial), name/tag/target, status `Badge` (live/upcoming/ended), raise progress bar. Tap → detail view (bigger progress bar, description copy, CTA disabled unless status is live).

### 14. Leaderboard (`LeaderboardScreen.jsx`)
- Ranked list in one glass panel: rank number (gold-tinted top 3), Avatar, handle + verified + streak (🔥 Nd), Miron Score (tabular, bold). Current user row highlighted with `var(--c-input)` bg + "Bạn" badge.

### 15. Settings (`SettingsScreen.jsx`)
- Profile summary row (avatar, handle, level/score). Grouped rows: Đổi PIN, Leaderboard shortcut, Notifications, Theme toggle (inline "Đổi" action), Sign out (danger-styled, red icon/text).

### 16. PWA chrome illustrations (`PwaScreens.jsx` → `InstallScreen`)
- Static mock of an iOS home screen with the MironPay icon (gradient rounded-square, logo mark) among placeholder app icons, plus an "Add to Home Screen" glass sheet mock — illustrates the installed-icon + install-prompt requirement from the brief. Not part of the interactive flow.

## Interactions & behavior
- Full linear auth/onboarding flow with back buttons at every step; PIN setup requires two matching 6-digit entries.
- Bottom tab bar (Dashboard/Wallet/Agent/Launchpad/Settings) only shows once authenticated and not inside a sub-route (Send/Receive/Scan-Pay/Leaderboard render full-screen with their own back button).
- Shared PIN-confirm bottom sheet (`PinModal.jsx`) is invoked by any action needing authorization (Send, Agent-initiated tx, Scan & Pay) — demo PIN is `123456`; wrong PIN shakes and clears.
- Theme toggle flips `document.documentElement.classList('light')`, which swaps every `--c-*`/`--glass-*` token per `tokens/colors.css` — build this as a real theme switch (e.g. CSS class or `data-theme` attr + context), not per-component branching.
- Loading/transition states: Google sign-in "Redirecting…" (1.1s), Agent typing indicator (3 pulsing dots, 1.3s), Send/Scan-pay 4-phase progress (spinner → checkmark per phase, ~850ms cadence).

## State management
- `stage`: splash | login | onb-username | onb-confirm | onb-pin | onb-complete | app
- `tab`: dashboard | wallet | agent | launchpad | settings
- `route` (stacked on top of a tab): send | receive | scanpay | leaderboard | null
- `username` (string, carried from onboarding into the confirm/complete screens)
- `pin` sheet state: `{ open, cb, title }` — generic "needs PIN" gate any flow can invoke with a callback to run on success
- `theme`: dark | light

## Design tokens
Full source of truth in `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, `tokens/animations.css`, `tokens/fonts.css` — always consume the semantic `--c-*`/`--glass-*`/`--radius-*`/`--shadow-*`/`--glow-*` custom properties (both dark and light values are defined there), never hardcode the hex values below directly in components:
- Brand: Sapphire `#2F6BFF` (dark) / `#1D4ED8` (light), Cyan spark `#22C6E0`, Ink `#070B15`, Ice `#EEF2FB`
- Primary gradient: `linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)`
- Status: success teal `#2dd4bf`/`#0d9488`, error `#fb6f84`/`#e11d48`, warning `#f5b748`/`#d97706`
- Glass: `--glass-bg`, `--glass-border`, `--glass-blur: 18px`, `--glass-hi`
- Radii: cards 14px (`--radius-lg`), inputs/buttons 10px (`--radius-md`), sheets/hero 20px (`--radius-xl`), pills/avatars fully round
- Type: Geist Sans (UI), Geist Mono (`@handle`, addresses, tabular numbers)

## Assets
- `assets/logo-mark.svg` — MironPay "Mi" monogram mark, copied from the design system's brand assets. Full icon kit (all sizes/variants for real PWA manifest icons, splash screens, apple-touch-icon) is documented in `PWA_DESIGN_BRIEF.md` §4 — pull the actual files from the repo's `/logo/` folder, do not regenerate.
- Icons: hand-built line-icon set in `icons.jsx` (Lucide-style substitution — flagged in the design system as a placeholder; swap for the real app's inline SVGs if/when available).
- QR codes in Receive/Scan screens are mock deterministic module grids for demo purposes only — replace with a real QR generate/decode library in production.

## Files in this bundle
- `MironPay PWA Prototype.dc.html` — the prototype host page (open this to click through everything)
- `AppMain.jsx` — top-level flow/router + state machine
- `LoginScreen.jsx`, `OnboardingScreens.jsx` — auth + onboarding screens
- `DashboardScreen.jsx`, `WalletScreen.jsx`, `AgentScreen.jsx`, `LaunchpadScreen.jsx`, `LeaderboardScreen.jsx`, `SettingsScreen.jsx` — main app screens
- `SendScreen.jsx`, `ReceiveScreen.jsx`, `ScanPayScreen.jsx` — payment flows
- `PinModal.jsx` — shared PIN-confirm sheet
- `PwaScreens.jsx` — Splash + home-screen/install illustration
- `icons.jsx` — icon set used throughout
- `tokens/*.css` — full design-token source (colors, type, spacing, effects, animations, fonts), both dark and light theme values
- `PWA_DESIGN_BRIEF.md` — original PWA requirements/handoff brief this design was built from (route inventory, current technical state, PWA checklist)
