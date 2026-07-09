# MironPay — Feature Specs

## Login Screen

### Route
`/login` → `app/(auth)/login/page.tsx`

### Auth Provider
Supabase Google OAuth via `supabase.auth.signInWithOAuth({ provider: 'google' })`.

### Flow
```
User at /login
  → clicks "Đăng nhập với Google"
  → loading state (button disabled, text thay đổi)
  → browser redirect → Google consent screen
  → user approves → Google → Supabase → redirect về /auth/callback?code=...
  → [CALLBACK] Supabase client tự exchange code (PKCE, detectSessionInUrl: true)
             → SIGNED_IN event → set user Zustand → router.replace('/dashboard')
  → [ERROR]  signInWithOAuth trả error → show message trên /login (hiếm, thường là config lỗi)
             hoặc callback nhận error param → redirect về /login
```

### OAuth Callback Route
`/auth/callback` → `app/auth/callback/page.tsx`

Explicit `exchangeCodeForSession(code)` từ `?code=` query param (PKCE flow).
Sau khi exchange thành công → kiểm tra username trong `profiles` table → route dựa trên kết quả.

#### Post-login redirect logic
```
exchangeCodeForSession OK
  → query: SELECT username FROM profiles WHERE id = userId
  → profile.username exists (non-empty)  → router.replace('/dashboard')
  → profile missing hoặc username null   → router.replace('/onboarding/username')
  → exchangeCodeForSession error          → show error + "Back to sign in"
  → ?error= param trong URL              → show error + "Back to sign in"
```

### Profiles Table (Supabase — cần tạo)
```sql
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique,
  created_at  timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);
```

### Route Map (auth guard)
| Route | Requires | Guard location |
|-------|----------|----------------|
| `/login` | — | client: redirect `/dashboard` if session |
| `/auth/callback` | — | — |
| `/onboarding/username` | session, no username | client-side |
| `/dashboard` | session + username | client-side |

### Setup cần làm ngoài code
| Nơi | Cần thêm |
|-----|----------|
| Supabase Dashboard → Authentication → URL Configuration → Redirect URLs | `http://localhost:3000/auth/callback` |
| Google Cloud Console → OAuth 2.0 → Authorized redirect URIs | Supabase xử lý, không cần thêm app URL trực tiếp |

### States — Login Page
| State | Mô tả |
|-------|-------|
| idle | Button "Đăng nhập với Google" sẵn sàng |
| loading | Button disabled, text "Đang chuyển hướng..." — trình duyệt sẽ rời trang |
| error | Hiển thị `error.message` từ Supabase phía trên button |

Không có form fields — không cần validation.

### States — Callback Page
| State | Mô tả |
|-------|-------|
| processing | Hiển thị "Đang xử lý đăng nhập..." |
| success | `router.replace('/dashboard')` — user không thấy màn hình này |
| error | `router.replace('/login')` |

### Redirect Logic
- `/login` mount: nếu đã có session → `router.replace('/dashboard')`
- `/auth/callback` success → `router.replace('/dashboard')`
- `/auth/callback` error → `router.replace('/login')`

### Auth State (Zustand)
Store: `app/store/auth.ts`
```ts
{ user: User | null, setUser: (user: User | null) => void }
```
Set `user` sau login. Clear trên logout.

### Route Protection (proxy.ts)
> Note: Full SSR protection cần `@supabase/ssr`. `proxy.ts` hiện là stub.

- Protected (`/dashboard`) → redirect `/login` nếu không có session
- Public (`/login`, `/auth/callback`) → redirect `/dashboard` nếu đã có session

### Out of Scope (this sprint)
- Signup (Google OAuth tự tạo account lần đầu)
- Email/password login
- Password reset / forgot password
- SSR-aware auth (cần `@supabase/ssr`)

---

## Home Wallet Screen

### Route
`/dashboard` → `app/(app)/dashboard/page.tsx`

### Auth Guard
On mount: `supabase.auth.getSession()` → no session → `router.replace('/login')`.
If user not in Zustand store (page refresh) → re-populate from session.

### Sections
```
┌─────────────────────────────┐
│ [Avatar] Hi, {firstName}    │  [Sign Out]
├─────────────────────────────┤
│        Wallet Balance        │
│          $1,250.00           │
│             USD              │
├─────────────────────────────┤
│  [Send]  [Receive]  [Top Up] │
├─────────────────────────────┤
│ Recent Transactions          │
│  + $500.00  Top up     Jun14 │
│  - $49.99   Netflix    Jun13 │
│  - $12.50   Grab       Jun12 │
│  + $200.00  Transfer   Jun11 │
│  - $8.99    Spotify    Jun10 │
└─────────────────────────────┘
```

### Data Model (Supabase tables — to be created)
```sql
-- wallets
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null unique
balance     numeric(12,2) default 0
currency    text default 'USD'
created_at  timestamptz default now()

-- transactions
id          uuid primary key default gen_random_uuid()
wallet_id   uuid references wallets not null
type        text not null  -- 'credit' | 'debit'
amount      numeric(12,2) not null
description text not null
created_at  timestamptz default now()
```

### Data Fetching
- Wallet: `SELECT * FROM wallets WHERE user_id = {userId}` — single row
- Transactions: `SELECT * FROM transactions WHERE wallet_id = {walletId} ORDER BY created_at DESC LIMIT 5`
- Both fetched in parallel via `Promise.all`
- Tables not yet created → fallback to mock data (see `app/(app)/dashboard/page.tsx` TODO)

### States
| State | Trigger | UI |
|-------|---------|----|
| loading | mount, auth check + data fetch in flight | skeleton placeholder text |
| authenticated | session valid + data ready | full content |
| unauthenticated | no session | null (redirect fires) |

### Quick Actions
Buttons render but are `disabled` / no-op — wired up in future sprints.
| Label | Future route |
|-------|-------------|
| Send | `/send` |
| Receive | `/receive` |
| Top Up | `/topup` |

### Sign Out Flow
1. `supabase.auth.signOut()`
2. Clear `useAuthStore` + `useWalletStore`
3. `router.replace('/login')`

### Zustand Stores
`app/store/wallet.ts`
```ts
{
  wallet: Wallet | null
  transactions: Transaction[]
  setWallet: (w: Wallet | null) => void
  setTransactions: (t: Transaction[]) => void
}
```

### Types (`app/lib/types.ts`)
```ts
type Wallet = { id: string; balance: number; currency: string }
type Transaction = { id: string; type: 'credit' | 'debit'; amount: number; description: string; created_at: string }
```

### Out of Scope (this sprint)
- Send / Receive / Top Up functionality
- Pagination on transactions
- Real-time balance updates (Supabase Realtime)
- Multi-currency support

---

## Onboarding Flow

### Route group
`app/(onboarding)/` — centered layout (same as auth group).

### Step 1 — Username Selection `/onboarding/username`

#### Input rules (enforced on keystroke)
- Lowercase only; strip any char not in `[a-z0-9_]`
- Max 20 chars enforced via `slice`

#### Validation (real-time, 500 ms debounce for DB check)
| Rule | Status | Message |
|------|--------|---------|
| empty | idle | — |
| < 3 chars | invalid | "At least 3 characters required" |
| > 20 chars | invalid | "Maximum 20 characters" |
| not `/^[a-z0-9_]+$/` | invalid | "Only lowercase letters, numbers, and underscores" |
| in blacklist | invalid | "This username is reserved" |
| exists in `profiles` | taken | "@{x} is already taken" |
| none of the above | available | "@{x} is available" |

#### Blacklist (partial)
`admin, administrator, support, help, root, system, mironpay, miron, null, undefined, api, auth, dashboard, login, logout, signup, register, account, settings, profile, user, users, mod, moderator, staff, official, owner, bot, contact, info, pay, payment, wallet`

#### Actions
- Input: `handleInput` sanitizes on change
- Continue button: enabled only when `status === 'available'`
- On Continue → `router.push('/onboarding/confirm-username?username={username}')`

### Step 2 — Confirm Username `/onboarding/confirm-username?username={username}`

- Guard: no `?username=` → redirect `/onboarding/username`
- Shows `@{username}` at `text-4xl font-bold`
- Warning banner: "Your username cannot be changed after this step."
- **Back** → `/onboarding/username`
- **Confirm** → `/onboarding/setup-pin?username={username}`

### Step 3 — Setup PIN `/onboarding/setup-pin?username={username}`

#### Phases (same page, `useState`)
| Phase | Header | Trigger to advance |
|-------|--------|--------------------|
| `entering` | "Enter a 6-digit PIN" | 6th digit → store as `firstPin`, reset display, → `confirming` |
| `confirming` | "Confirm your PIN" | 6th digit → compare with `firstPin` |
| `saving` | "Saving..." | after match confirmed |

#### PIN mismatch
- Show "PINs don't match. Please try again." (red)
- Reset `firstPin = ''`, `currentPin = ''`, phase → `entering`

#### Numpad layout
```
1  2  3
4  5  6
7  8  9
   0  ⌫
```
Empty cell (top-left of bottom row) is a non-interactive `<div />` for alignment.

#### PIN dot indicator
6 circles. Filled (black) for entered digits, empty (gray border) for remaining.

#### Save to Supabase
```typescript
// Hash with Web Crypto API (SHA-256) before storing
const pinHash = await hashPin(pin)
supabase.from('profiles').upsert({ id: session.user.id, username, pin_hash: pinHash })
```
On success → `router.replace('/dashboard')`
On error → show `dbError.message`, reset to `entering`

### Supabase `profiles` table — additional column needed
```sql
alter table profiles add column pin_hash text;
```

### Auth guards (all onboarding pages)
`useEffect` on mount: `getSession()` → no session → `/login`

### Data flow between steps
Username travels via URL query param — no Zustand store needed.
PIN never leaves the client until hashed and saved at step 3.
