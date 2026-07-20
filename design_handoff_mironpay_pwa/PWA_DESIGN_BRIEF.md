# MironPay — PWA Design Brief

Handoff package for designing MironPay as an installable Progressive Web App (PWA): real home-screen icon, standalone app-like chrome (no browser bar), and a UI that works cleanly across every phone screen ratio. This document is the complete current-state + requirements package — hand it to the design tool as-is.

## 1. What MironPay is

Stablecoin wallet + AI payments agent on Circle's ARC Testnet (USDC/EURC). Google-only sign-in (no seed phrase/password), a "Main Wallet" (user funds) and an "Agent Wallet" (AI-spendable, daily limit), an AI chat agent that can send/swap/query live market data, a Launchpad (IDO) module, and a Miron Score gamification/leaderboard system.

## 2. Current technical state (as of today)

- **Zero PWA setup exists.** `app/layout.tsx` has no `<link rel="manifest">`, no `theme-color` meta, no `apple-touch-icon`, no `Metadata.icons`. "Add to Home Screen" today just bookmarks a browser tab with a default icon — no standalone app chrome, no real icon.
- **Mobile browsers are currently actively blocked.** `proxy.ts` matches mobile user-agents and serves a "please use a computer" interstitial (403) instead of the app. This must be removed/replaced once the PWA is ready — it's the reason nothing mobile has been tested yet.
- **The dashboard already has a mobile-specific JSX branch** (`app/(app)/dashboard/page.tsx`, `lg:hidden` block vs. `hidden lg:flex` desktop block) — but it was built without real mobile testing (since mobile is blocked), so treat it as a rough draft, not a finished reference.
- **The Sidebar nav (`app/components/Sidebar.tsx`) is desktop-only** (`hidden lg:flex`, fixed 236px left rail) — there is currently **no bottom tab bar or any persistent navigation for mobile**. This is a gap the redesign needs to fill.
- **Desktop layouts use hard pixel values** (`height: '100vh'`, fixed grid columns like `344px` right rail, fixed modal widths like `432px`) rather than fluid units — these will not adapt to arbitrary phone widths as-is.

## 3. Brand identity (source of truth: `logo/manifest.json` + `app/globals.css`)

**Mark**: "Mi" monogram — route-M shape + dotted "i" rendered as a cyan spark.

**Core palette**:
| Token | Hex | Use |
|---|---|---|
| Sapphire (dark theme) | `#2F6BFF` | primary brand blue |
| Sapphire (light theme) | `#1D4ED8` | primary brand blue, light bg |
| Cyan Spark | `#22C6E0` | the "i" dot accent, success/live states |
| Ink | `#070B15` | near-black, dark bg base |
| Ice | `#EEF2FB` | near-white, light bg base |
| Brand gradient | `#7B7CF6 → #5654E2` | primary CTA/icon gradient (135deg) |
| Pay accent (dark) | `#8487F5` | "Pay" wordmark accent, dark theme |
| Pay accent (light) | `#5654E2` | "Pay" wordmark accent, light theme |

**Extended semantic tokens** (`app/globals.css`, full dark+light pairs already defined — reuse verbatim, don't invent new ones):
- Page/panel backgrounds: `--c-page`, `--c-panel`, `--c-sidebar` (dark: `#070a18`/`#111829`/`#0c1130`; light: `#f0eeff`/`#ffffff`/`#eae6ff`)
- Text: `--c-text`, `--c-muted`, `--c-muted2`
- Status: `--c-success` (teal `#2dd4bf`/`#0d9488`), error/danger `#fb6f84`/`#e11d48`, warning `#f5b748`/`#d97706`
- Glass surface (used on landing + auth flow): `--glass-bg`, `--glass-border`, `--glass-blur: 18px`, `--glass-hi`
- Primary gradient/glow: `--grad-primary: linear-gradient(135deg,#818cf8 0%,#6366f1 52%,#4338ca 100%)`, `--glow-primary: 0 8px 30px rgba(99,102,241,.42)`
- Wallet-specific card treatments: `--wc-blue-grad`/`--wc-blue-border` (Main Wallet), `--wc-purple-grad`/`--wc-purple-border` (Agent Wallet)

**Typography**: Geist Sans (UI text), Geist Mono (`@handle`, wallet addresses, PIN-adjacent, numeric tabular data) — both via `next/font/google`, already wired as CSS vars `--font-geist-sans`/`--font-geist-mono`.

**Radii convention**: cards 14–22px, buttons/inputs 10–14px, pills/avatars fully round.

## 4. Icon assets — already produced, ready to use

Full icon kit already exists at **`/logo/` (project root, NOT yet copied into `/public/`)** — 38 files, manifest at `logo/manifest.json` documents every variant:

- **Primary app icon shape**: `rounded` (5:4 aspect, w×0.8h) — full-colour sapphire gradient, sizes 16/32/48/64/128/256/512/1024px (`miron-logo-rounded-color-*.png`)
- **Avatar/circular shape**: `circle` (1:1) — same size set (`miron-logo-circle-color-*.png`)
- Each shape also has `mono-white` (light mark, for dark surfaces) and `mono-ink` (dark mark, for light surfaces) knockout variants
- Lockups: horizontal, stacked, wordmark-only — each in dark/light theme versions

**For the PWA manifest, use**: `miron-logo-rounded-color-512x410.png` and `-1024x819.png` as the primary `icons` entries (note: rounded shape is NOT square — 5:4 — a designer should confirm whether to pad to square 1:1 for manifest `icons` compliance, since most PWA icon slots expect square source images that get masked; the `circle-color` 512×512/1024×1024 variants are already perfectly square and may be the safer manifest choice, with `rounded-color` used for platforms that support non-square + maskable icons).

## 5. Screens to design responsive for (full route inventory)

| Route | Purpose | Current responsive state |
|---|---|---|
| `/` | Landing/marketing + sign-in | Responsive, built mobile-first already |
| `/auth/callback` | Silent OAuth redirect | Uses shared `AuthShell` (460px max-width card, centers fine on any width) |
| `/onboarding/username` | Pick @handle | `AuthShell`, same as above |
| `/onboarding/confirm-username` | Confirm handle | `AuthShell` |
| `/onboarding/setup-pin` | 6-digit PIN + wallet creation | `AuthShell`, numpad UI |
| `/onboarding/complete` | Wallet-created summary | `AuthShell` |
| `/dashboard` | Main hub: balances, AI chat, activity | Has separate mobile/desktop JSX branches — mobile branch is untested draft |
| `/wallet` | Full wallet detail, holdings, send/receive/swap | Desktop-oriented, needs mobile audit |
| `/agent` | Full-page AI chat | Desktop-oriented, needs mobile audit |
| `/launchpad`, `/launchpad/[id]`, `/launchpad/submit` | IDO discovery/detail/submission | Desktop-oriented |
| `/token/[symbol]` | Token detail page | Desktop-oriented |
| `/settings` | Account settings | Desktop-oriented |
| `/leaderboard` | On-chain agent reputation leaderboard | Desktop-oriented |
| `/(app)/admin/launchpad` | Internal admin only | Low priority for mobile |

The `/onboarding/*` + `/auth/callback` flow (all built on the shared `AuthShell` component, see recent redesign) is already close to responsive-ready since it's a single centered card pattern — lowest-risk starting point. The `(app)` routes (dashboard/wallet/agent/etc.) are the real redesign surface.

## 6. PWA requirements checklist (what "done" means)

- [ ] `public/manifest.json` (or `.webmanifest`) with: `name: "MironPay"`, `short_name: "MironPay"`, `theme_color` (sapphire), `background_color` (ink `#070B15`), `display: "standalone"`, `start_url`, full `icons` array (using the asset set in §4)
- [ ] `<link rel="manifest">` + `<meta name="theme-color">` + `apple-touch-icon` wired into `app/layout.tsx` `<head>` (Next.js `Metadata` API supports all of this declaratively)
- [ ] iOS-specific meta (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`) for proper standalone behavior on iPhone
- [ ] Splash screens (iOS requires static image splash screens per device size; Android generates from manifest icon + background_color automatically)
- [ ] Safe-area handling for notch/Dynamic Island/home-indicator devices — `env(safe-area-inset-*)` CSS, especially for the bottom tab bar (§3 gap) and fixed headers
- [ ] A real bottom tab nav for mobile (currently missing entirely — Sidebar is desktop-only)
- [ ] Responsive rework of the `(app)` route group's fixed-pixel layouts (§2) to fluid/breakpoint-based sizing
- [ ] Remove or scope down the mobile-blocking check in `proxy.ts` once the above is ready
- [ ] Design for a genuine range of ratios, not just "one phone mockup": small (iPhone SE ~375×667), standard (~390×844), tall/Pro Max (~430×932), and common Android ratios (~360×800, foldables unfolded ~600–700 wide) — plus tablet as a stretch goal since the breakpoint is currently a hard `lg:` cutoff

## 7. What's explicitly NOT required right now

- No native app / App Store submission — PWA only
- No offline support / service worker caching strategy requested — standalone install + responsive UI is the scope
- Admin routes (`/admin/*`) can stay desktop-only
