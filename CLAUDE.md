@AGENTS.md

# MironPay — Project Instructions

## Stack
- Next.js 16.2.9 (App Router, NOT Pages Router)
- React 19.2.4 with TypeScript
- Tailwind CSS v4 (PostCSS-based — no `tailwind.config.js`, configured via `@import "tailwindcss"` in globals.css)
- Supabase (auth + database) via `@supabase/supabase-js` v2
- Zustand v5 (client-side state)
- Circle Developer-Controlled Wallets SDK (`@circle-fin/developer-controlled-wallets`)
- Circle Swap Kit (`@circle-fin/swap-kit`) + Circle Wallets Adapter (`@circle-fin/adapter-circle-wallets`) — installed with `--legacy-peer-deps`
- x402 Nanopayments: `@circle-fin/x402-batching` + `@x402/core` + `@x402/evm` — installed with `--legacy-peer-deps`. Agent Wallet must be **EOA** (SCA unsupported — ecrecover verify, no ERC-1271). Signing goes through Circle's `signTypedData()` API (no raw private key ever needed/stored). See `app/lib/x402-signer.ts`, `app/lib/x402-buyer.ts`, `app/api/x402/market-data/route.ts`.
- `qrcode.react` for QR code display
- `papaparse` (+ `@types/papaparse`) — CSV parsing for Payroll v0 monthly amount uploads (`app/api/payroll/runs/[runId]/upload/route.ts`)
- `viem` — already a transitive dependency (via Circle SDK), used directly for address checksum validation (`getAddress`) and ABI encoding (`encodeFunctionData`) in payroll routes and `scripts/test-aggregate3.mjs`

## Next.js 16 Breaking Changes (read before writing any code)
- **`proxy.ts` not `middleware.ts`**: Route interception file is `proxy.ts` at project root. Export named `proxy` function (not `default`). See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **`params` and `searchParams` are Promises**: Must `await params` and `await searchParams` in Server Components.
- **`cookies()` is async**: Must `await cookies()` when importing from `next/headers`.
- **`PageProps` / `LayoutProps`**: Global type helpers, no import needed.
- **Server Functions**: Use `'use server'` directive inside async functions or at top of file. For mutations invoked from a form, pass the function to `action` prop.

## File Structure
```
app/
  (auth)/            # route group for unauthenticated pages
    login/page.tsx
    layout.tsx
  (app)/             # route group for authenticated pages
    dashboard/page.tsx
    layout.tsx
  actions/auth.ts    # Server Actions
  lib/supabase.ts    # Supabase browser client singleton
  store/auth.ts      # Zustand auth store
proxy.ts             # Route guard (replaces middleware.ts)
SPEC.md              # Feature specifications
```

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Auth Pattern
- Supabase Google OAuth (`signInWithOAuth`)
- Current: session in localStorage (browser client) — sufficient for MVP
- Production: migrate to `@supabase/ssr` for cookie-based sessions + SSR auth guards
- Client auth state via Zustand `useAuthStore`
- Route protection in `proxy.ts` (reads Supabase cookie once `@supabase/ssr` is added)

## Rules
- Do NOT use `middleware.ts` — it is renamed to `proxy.ts` in Next.js 16
- Do NOT access `cookies()` synchronously
- Do NOT read `params` without `await` in Server Components
- Do NOT install new packages without noting them here
