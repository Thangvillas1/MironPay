# MironPay Design System

> The design guide and manifest for **MironPay** — a crypto payment app ("Venmo for stablecoins"). This file is the source of truth for anyone designing MironPay UI. Read it before building.

---

## 1. Product context

MironPay is a **mobile-first crypto payment app**. Users:
- Hold a **multi-wallet** — Main (USDC), Agent AI, and Status.
- **Send / receive USDC on-chain** (ARC network, Circle wallets).
- Chat with an **AI Agent** that executes on-chain transactions on their behalf (each message costs a small amount of USDC).
- Earn a **Miron Score** — reputation points for activity, with streaks, levels and XP.
- **Swap** tokens and view price charts.

The app is mobile-first (design at 375px) but responsive to desktop (200px fixed sidebar). **Dark theme is the default**; a refined cool-ice light theme is equally first-class. The visual language is **"Sapphire / Neo-fintech"** — deep navy canvas, sapphire accent, glassmorphism, sharp-but-soft corners.

### Surfaces
- **Auth** — Google sign-in, no form fields.
- **Onboarding** — username → confirm username → 6-digit PIN setup (3 steps).
- **App** (authenticated) — Dashboard hub, Agent chat, Send, Receive, Swap, Token detail. Sidebar (desktop) + bottom tab bar (mobile).

### Sources provided
- `uploads/DESIGN.md` — the original developer handoff (full design system, route inventory, component list, feature flows). **No codebase or Figma was attached** — this system is reconstructed faithfully from that spec. If you have access to the real Next.js repo (`app/globals.css`, `components/*.tsx`), it supersedes anything inferred here.

---

## 2. Content fundamentals

How MironPay writes copy:
- **Voice:** friendly, direct, crypto-native but never jargon-heavy. Short sentences. Speaks **to** the user ("Send stablecoins as easily as a text", "Confirm with your PIN").
- **Casing:** Sentence case everywhere — buttons ("Send USDC", "Sign in with Google"), headings ("Recent activity", "Holdings"). Never Title Case UI, never ALL CAPS except tiny eyebrow labels (letter-spaced, e.g. "MIRON SCORE").
- **Handles & amounts:** usernames are always `@handle`. Amounts lead with sign and currency — `+120.00`, `-25.00 USDC`, `$2,480.55`. Addresses/hashes are truncated mono: `0x7a3f…9C2e`.
- **Person:** first person for the agent ("I can send, swap, or check balances"), second person for the app ("your wallet, your AI agent").
- **Emoji:** used **sparingly and deliberately** — the 🔥 streak indicator and an occasional 👋 in the agent greeting. Emoji are NOT decorative elsewhere; do not sprinkle them into UI.
- **Empty states:** plain and encouraging — "No transactions yet. Send or receive USDC to get started."
- **Microcopy vibe:** reassuring around money/security ("Confirm to authorize this transaction", "Your username cannot be changed after this step.").

---

## 3. Visual foundations

- **Color & vibe:** deep, slightly-blue near-black canvas (`#070b15`) with **sapphire as the single brand accent** (`#2f6bff`), often as a sapphire→azure gradient. Cool, nocturnal, **private-banking** restraint — confident, trustworthy, not playful. Light theme flips to a cool ice (`#eef2fb`) with deeper sapphire (`#1d4ed8`). Mint-green (`#2bd4a4`) for positive amounts, champagne-gold (`#f5b748`) for streaks, coral (`#ff5d6c`) for negative — used sparingly.
- **Glassmorphism:** the signature surface. Hero cards and panels are **frosted glass** — `var(--glass-bg)` (translucent navy) + `backdrop-filter: blur(18px)` + a hairline `var(--glass-border)` + a 1px top-edge inner highlight (`inset 0 1px 0 var(--glass-hi)`). This needs the gradient canvas behind it to read — keep the ambient radial glows.
- **Wallet identity colors:** analogous blue family for cohesion — Main = sapphire `#2f6bff`, Agent = indigo `#6d6cff`, Status = cyan `#22c6e0`. Each wallet card tints its glass with a faint accent gradient + a matching soft glow.
- **Type:** **Geist Sans** for everything, **Geist Mono** for addresses, hashes, handles and tabular amounts. Big balances are **semibold (600)**, `-0.03em` tracking, `tabular-nums` — large and airy rather than heavy, for a premium feel.
- **Spacing & shape:** 4px grid, generous whitespace. **Sharper corners than before** — cards `--radius-lg` (14px), inputs/controls `--radius-md` (10px), sheets `--radius-xl` (20px), pills/avatars fully round.
- **Backgrounds:** flat deep-navy surfaces with **subtle sapphire/cyan radial glows** behind hero areas (login, app frame, total-balance). No photographic imagery, no busy patterns. Gradients are reserved for: the brand mark, primary CTAs, the total-balance & Miron Score cards, wallet-accent tints, and progress bars.
- **Elevation:** deep, blue-tuned shadows (`0 8px 28px rgba(3,8,20,.45)`). Colored **glows** (azure family, low opacity) on hero/wallet cards rather than gray drop-shadows. Hairline borders do most separation work on dark.
- **Cards:** glass (hero/wallet/score) or `--c-panel` + hairline border (dense lists). Rounded 14px. Top-edge highlight on glass.
- **Borders:** ultra-low-contrast hairlines — `rgba(255,255,255,0.07)` default, `0.14` strong. Light theme: `rgba(13,28,64,0.10)`.
- **Motion:** subtle and fast. `140–340ms`, ease-out `cubic-bezier(.22,1,.36,1)`. Signature interactions: hero/wallet cards **lift** `translateY(-3px) scale(1.02)` + intensified glow on hover; icon buttons **scale 1.06–1.08**; buttons **press to 0.97**. Modals **slide up from bottom** (mobile). PIN errors **shake**. No bouncy springs, no looping decorative animation.
- **Hover / press:** hover = surface lightens to `--c-input` or element scales up; press = scale down. Active nav = sapphire text + faint `--c-input` pill.
- **Transparency & blur:** core to the system — glass panels, the blurred bottom tab bar, and the PIN overlay all use `backdrop-filter`. Dense list rows stay opaque for legibility.
- **Imagery vibe:** none shipped — token logos are simple colored circles. If imagery is added, keep it cool-toned, dark, sapphire-leaning.

---

## 4. Iconography

- **Style:** clean **line icons**, ~1.9px stroke, round caps/joins, 24px grid — the look of hand-drawn inline SVGs the real app uses (it ships no icon library; icons are inline `<svg>`).
- **Substitution flag:** the real repo's exact SVG paths weren't provided. This system uses a **Lucide-style hand-built set** (`ui_kits/mironpay-app/icons.jsx`) that matches that stroke weight and fill style. If you have the real icons, drop them in and update that file. ⚠️ *Flagged substitution.*
- **Brand glyphs:** the wallet/agent/swap/score icons are bespoke and live in `icons.jsx`. The Google "G" is its multicolor mark (used only on the sign-in button).
- **Emoji as icon:** only 🔥 for streaks (in `MironScoreCard`) and 👋 in the agent greeting — intentional, not decorative.
- **Token logos:** rendered as colored circles with the symbol initial(s), or an image if a logo URL is supplied to `TokenRow`.
- **The verified badge** is a dedicated component (`VerifiedBadge`) — a blue scalloped tick, shown after verified `@handles` and on avatars.

---

## 5. Index / manifest

**Root**
- `styles.css` — global entry point (consumers link this). `@import` list only.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `animations.css`.
- `assets/` — `logo-mark.svg`, `wordmark.svg` *(placeholder brand marks — see caveats)*.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `SKILL.md` — Agent-Skill wrapper for use in Claude Code.

**Components** (`components/<group>/`, namespace `window.MironPayDesignSystem_<hash>`)
- `core/` — `Button`, `IconButton`, `Badge`, `Avatar`, `VerifiedBadge`
- `forms/` — `Input`, `PinDots`
- `product/` — `WalletCard`, `QuickAction`, `TokenRow`, `NavItem`, `MironScoreCard`

**UI kits** (`ui_kits/`)
- `mironpay-app/` — interactive mobile prototype: Login → Dashboard hub → Send (PIN + 4-phase progress) → Receive (QR) → Agent chat. Open `index.html`.

---

## 6. Usage

Consumers link the one stylesheet and read components off the global namespace:

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { Button, WalletCard } = window.MironPayDesignSystem_577c4b;
</script>
```

Always use the semantic `--c-*` tokens (not raw hex) so light theme works. Toggle light mode with `document.documentElement.classList.add('light')`.
