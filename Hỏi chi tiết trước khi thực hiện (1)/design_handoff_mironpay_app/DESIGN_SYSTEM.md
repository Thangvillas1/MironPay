# MironPay Obsidian — Design System

The complete visual system behind the MironPay wallet, as a spec. `MironPay Design System (standalone).html` in this folder is the same content rendered — open it to see every token, component and state live. Build the app against these tokens; never hard-code a hex, size or duration that a token already carries.

Direction: one typeface, one accent, flat bordered surfaces. Gold reads as stroke and state, not as fill. Dark is the primary ground; light is a full parallel token set, not a tint of dark.

---

## 1. Color

Colors are CSS variables set on a theme class (`.thm-dark` / `.thm-light`). Components never name a hex. Both themes carry the same sixteen roles, so a screen built once renders in either with no conditionals. In a native build, mirror this as one semantic color set with two value tables.

| Role | Dark | Light | Used for |
|---|---|---|---|
| `--bg` | `#101014` | `#f5f4f2` | Screen ground |
| `--bg2` | `#17171c` | `#ffffff` | Cards, sheets, inputs, dialogs |
| `--bg3` | `#0c0c10` | `#f5f4f2` | Recessed cells, stat cells, table heads |
| `--tab` | `#0c0c10` | `#ffffff` | Bottom tab bar |
| `--line` | `#26262e` | `#e5e2dc` | Container edges (1px) |
| `--line2` | `#1e1e25` | `#ecebe7` | Softer rules between list rows |
| `--tx` | `#f2f2f4` | `#17161a` | Primary text |
| `--mut` | `#8b8b94` | `#7d7a74` | Secondary text, kickers, placeholders |
| `--gold` | `#c9a35f` | `#b68235` | Accent — borders, icons, active state, primary fill |
| `--goldT` | `#15120b` | `#ffffff` | Text on gold |
| `--up` | `#34c98e` | `#0f9d63` | Positive amounts, success |
| `--upBg` | `#123527` | `#e2f4ea` | Success tinted ground |
| `--dn` | `#ff7a6b` | `#d64530` | Errors, failed biometrics |
| `--dnBg` | `#3a1d18` | `#fbe7e1` | Error tinted ground |
| `--warn` | `#e2b25a` | `#b5831f` | Warnings, expiry, underpaid |
| `--warnBg` | `#3a2f16` | `#f7edd6` | Warning tinted ground |

Rules:
- **Gold is a stroke.** Borders, icons, active labels, and thin fills at 7–24% opacity. The only solid gold in the app is the primary button and the raised QR tab button.
- **Two line weights.** `--line` for container edges, `--line2` for row rules inside a list.
- **Signed money is colored.** Incoming uses `--up`; outgoing stays default text color. Never both on one figure.
- The Face ID viewfinder is always near-black `#08080a` in both themes — it reads as a camera, not as chrome.
- If a role is missing, add it to **both** themes. Never invent a one-off hex.

### Theme resolution
Three states: `auto` (default), `dark`, `light`. `auto` follows the OS via `prefers-color-scheme` and updates live when the system flips. An explicit in-app toggle overrides `auto` for the session.

---

## 2. Type

**Space Grotesk** at weights 400/500/600/700 — the only family, for labels, prose and figures alike. All money and all numerals set `tabular-nums` so columns and live balances never shift width.

| Style | Spec | Example |
|---|---|---|
| Balance display | 44px / 700 / -0.03em / tnum | `1,284.60` |
| Screen title | 16px / 700 | Confirm with Face ID |
| Row title | 13.5px / 700 | Sent to @lan |
| Body | 12–13.5px / 400 / 1.6 | Look at your camera to confirm this transfer. |
| Secondary | 10.5–12px / 400 / `--mut` | Aug 6 · Transfer · fee 0.02 USD |
| Kicker | 10px / 600 / 0.14em / uppercase | TOTAL ASSETS |
| Micro label | 8–9.5px / 600 / 0.08em | 24H CHANGE |

The balance display splits: integer part at full size, decimals smaller and muted.

---

## 3. Shape & elevation

| Radius | Value | Applied to |
|---|---|---|
| Pill | `99px` | All buttons, chips, pills, toasts |
| Field | `9px` | Stat cells, small recessed cells |
| Card | `12px` | Cards, inputs, detail panels |
| Sheet | `18px` | Bottom sheets (top corners), dialogs |
| Screen | `38px` | Device screen corners |

Elevation is carried by **borders, not shadows**. The system has exactly two shadows: the raised QR tab button and the desktop preview bezel (the latter isn't part of the real app). Overlays darken instead — `rgba(0,0,0,.5)` for sheets and dialogs, a 94% wash of the ground for busy states.

---

## 4. Components

### Actions
Every action is a pill. **One filled primary per screen**, pinned to the bottom in a `.cta` stack; everything else is outlined and turns gold on hover.

- `.btn2` — primary. Full width, 13px vertical padding, `--gold` fill, `--goldT` text, 700. Hover brightens 7%. Disabled drops to 35% opacity.
- `.btng` — secondary. Same shape, transparent, 1px `--line` border, `--tx` text. Hover switches the border to `--gold`.
- `.pill` — inline compact action (currency picker, hash link). 4px/11px padding, bordered.
- `.chip` — filter/quick-percent. `.on` state gets a gold border, gold text, and a 12% gold ground.
- `.qaBtn` — 31px circular icon button, gold glyph, bordered.
- `.xbtn` — 24px circular dismiss.
- `.tile` — quick-action grid cell: gold icon over a 10px/700 label, sitting in a 1px-gap grid whose gaps show `--line` through.
- `.seg2` — segmented control. Bordered pill container; the active option takes a 16% gold ground and gold text.
- `.swtch` — 38×22 toggle. Off: muted knob on `--bg3`. On: gold knob, gold border, 24% gold ground. Knob translates 16px over 180ms.

Minimum touch target is 44px throughout, regardless of the visual size of the control.

### Inputs
- `.inp` — 11px/14px padding, `--bg2` ground, 1px `--line`, 12px radius, muted placeholder. Focus: 2px gold outline at 1px offset plus a gold border. Never leave a default browser focus ring.
- `.pinDots` / `.pinDot` — six 13px circles, 12px gap. Empty: bordered. Filled: solid gold. Error: solid `--dn` (all six at once).
- `.kp` — 3-column numeric keypad, 52px rows, 21px tabular figures, 1–9 then blank/0/⌫. Hover tints 10% gold.

### Surfaces & data
- `.item` — list row: 34px circular bordered avatar/icon, a title (13.5/700) + detail (10.5px muted) block, and a right-aligned tabular amount. Rows separate with a `--line2` top border.
- `.rrow` — review table row: muted 12px key left, 13px/700 tabular value right, `--line2` rules between (none on the first).
- `.scell` — stat cell: `--bg3` ground, 9px radius, 8px letterspaced key over an 11px/700 tabular value.
- `.tdetail` — bordered detail panel on `--bg2`.
- `.confirmCard` — centered dialog, max-width 270px, 18px radius, `--bg2`, 1px `--line`. Gold ring+check icon, 15px/700 title, 11.5px muted recap, then a two-button row (`.btng` "Go back" + `.btn2` "Confirm").
- `.toast` — inverted pill: `--tx` ground, `--bg` text, 11.5px/600. Visible 1800ms.
- Bottom sheets — `--bg2`, 18px top corners, rise from 40px below over 260ms.

---

## 5. Biometric pattern

One viewfinder component covers every authentication moment — app entry, and confirming a send, a swap, or a merchant payment. The bracket and glyph carry the state; the copy changes, the geometry never does.

Geometry: 210×210 card (170px in the spec sheet), `#08080a` ground, 16px radius, four corner brackets at 3px stroke, a small face-outline glyph centered, and a 1.5px horizontal laser line sweeping vertically.

| State | Bracket | Glyph opacity | Extra | Copy |
|---|---|---|---|---|
| Scanning | `--gold` | 55% | Laser sweeping | "Unlock with Face ID" / "Confirm with Face ID" |
| Verified | `--up` | 15% | Green ring+check pops in center | "Face ID verified" / "Verified" |
| Not recognized | `--dn` | 15% | Red ring+X pops in, box shakes once | "Face not recognized" |

Rules:
- Scan resolves in **1300ms**; success holds **550ms** before acting.
- A PIN fallback is always one tap away ("Use PIN instead"), and becomes the only path after **three consecutive failures**, which lock the biometric method for **30 minutes**. The PIN itself is never locked.
- Authorizing an **outgoing** action requires it. Watching an **incoming** payment (the merchant accept-payment screen) does not.
- On a native build, prefer the real system biometric sheet (LocalAuthentication / BiometricPrompt) over redrawing this viewfinder — but keep the surrounding screen, the copy, the PIN fallback and the lockout rule exactly as specified.

---

## 6. Motion

| Name | Effect | Timing |
|---|---|---|
| `sIn` | Screen enters — translateX 22px to 0, fade | 260ms ease |
| `fIn` | Backdrop and overlay fade in | 180–200ms ease |
| `up` | Bottom sheet rises 40px | 260ms ease |
| `pop` / `popCenter` | Success mark overshoots to 1.08 then settles | 220–450ms ease |
| `exIn` | Inline token detail drops in 8px | 240ms ease |
| `miPulse` | Loading glyph breathes (opacity .35↔1, scale .94↔1) | 1050ms infinite |
| `scanY` | Scan laser sweeps 8% → 88% → 8% | 2200ms infinite |
| `faceShake` | Viewfinder wobbles on a failed scan (∓6px, ∓4px) | 400ms ease |

Behavioral timings: PIN digit compare 150ms · face scan 1300ms · face success hold 550ms · fail→lockout PIN switch 750ms · transaction broadcast overlay 1600ms · QR scan simulation 2400ms · merchant order countdown 180s · toast 1800ms.

---

## 7. Do & don't

**Do**
- Draw containers with 1px borders and let the ground stay flat.
- Keep one filled gold action per screen, pinned to the bottom.
- Set every figure tabular so numbers never reflow.
- Reuse the same confirm dialog and biometric gate for all three transaction types.
- Keep touch targets at 44px and above.

**Don't**
- Don't add a second accent — gold is the only chromatic voice.
- Don't fill cards, rows, or sheets with solid gold.
- Don't introduce drop shadows for hierarchy; use a border or a ground shift.
- Don't mix in a second typeface, and don't reach past weight 700.
- Don't invent a hex — if a role is missing, add it to both themes.

---

## Assets
- `assets/mi-icon-g.png` — app glyph, used on loading/pulsing states.
- `assets/mi-lockup-dark-g.png` / `assets/mi-lockup-light-g.png` — wordmark lockup, theme-swapped.
