# MironPay — Tổng hợp toàn bộ dự án (tính đến 14/07/2026)

> Tài liệu này đóng gói toàn bộ những gì đã làm, đang làm, và kế hoạch tương lai của MironPay, dựa trên lịch sử làm việc với Claude Code. Dùng để paste vào Claude chat mới khi cần bàn tiếp về dự án.

---

## 1. MironPay là gì

Ứng dụng ví stablecoin (USDC/EURC) trên **ARC Testnet** (chain của Circle), với:
- Đăng nhập bằng Google (Supabase Auth OAuth) — không cần seed phrase, không cần gas token riêng (USDC chính là gas native trên ARC).
- 2 loại ví cho mỗi user: **Main Wallet** (EOA, user tự PIN duyệt mọi giao dịch) và **Agent Wallet** (EOA, "Miron Agent" — AI chatbot tự thực hiện lệnh trong hạn mức được cấp).
- Miron Agent: chatbot AI (Groq `llama-3.3-70b-versatile`) hiểu lệnh tiếng Việt/Anh, tự thực hiện send/swap/mua IDO trong hạn mức, tự trả tiền cho các API data (x402 nanopayments) mà không cần user duyệt từng lần.
- Có identity on-chain thật: đăng ký ERC-8004 (Agent ID #840671), có reputation registry, có leaderboard toàn ARC network.
- Có Launchpad (IDO) — dự án gọi vốn, mua qua Agent, FCFS enforced on-chain.
- Miron Score — hệ thống gamification/level cho user.

**Stack:** Next.js 16.2.9 (App Router), React 19.2.4 + TypeScript, Tailwind CSS v4, Supabase (auth+DB), Zustand, Circle Developer-Controlled Wallets SDK, Circle Swap Kit, x402 Nanopayments (`@circle-fin/x402-batching` + `@x402/core` + `@x402/evm`).

Domain thật: **mironpay.xyz** (đã gắn Vercel + GoDaddy DNS, 14/07/2026).

---

## 2. Đã làm xong (production-ready hoặc verify thật)

### 2.1 Hạ tầng & Auth
- Google OAuth thật (Supabase), landing page bấm "Launch App" → OAuth trực tiếp → `/dashboard`, không qua trang `/login` trung gian nữa.
- Domain `mironpay.xyz` gắn Vercel qua GoDaddy DNS (A record → 76.76.21.21), Supabase Auth redirect URL đã cập nhật.
- Landing page (`app/page.tsx`) đã chuẩn hoá design token đầy đủ (type scale, button, spacing), responsive mobile, đã trải qua ~17 vòng chỉnh sửa chi tiết (xem mục 5).

### 2.2 Agent on-chain identity (ERC-8004)
- Miron Agent đã đăng ký on-chain: **Agent ID #840671**, owner wallet `0x7a3bc75bbc8d7022897a11632f7a7b90567a004e`.
- ReputationRegistry (`0x8004B663056A597Dffe9eCcC1965A193B7388713`) — đọc/ghi feedback on-chain thật, dùng hàm `readAllFeedback()` (không phải `getSummary()` vì hàm đó revert khi rỗng).
- **Bug đã fix (03/07):** ABI mismatch ở `giveFeedback()` khiến điểm bị chia 10 lần (feedbackType nhét nhầm vào slot valueDecimals) — đã sửa, nhưng 30 feedback cũ trên chain vẫn sai (không sửa ngược được).
- Dashboard card "Your AI agent" thay cho card "Top IDO" cũ — hiện Agent ID, tx count, reputation on-chain, animated mascot `AgentAvatar`.

### 2.3 ARC Agent Leaderboard (public, toàn network)
- Đã build xong: indexer (`scripts/backfill-agent-index.mjs` + cron route), DB (Supabase `arc_agent_leaderboard`/`arc_feedback_events`/`arc_index_state`), API public `app/api/agent/leaderboard-public/route.ts`, UI `app/leaderboard/page.tsx`.
- Kiến trúc tổng quát cho toàn bộ agent ERC-8004 trên ARC, không chỉ riêng Miron — Miron chỉ là 1 dòng dữ liệu được highlight.
- **Còn thiếu để mở public thật:** (1) deploy domain thật, (2) nối Vercel Cron cho `/api/cron/agent-index`, (3) CORS + rate-limit. Không cần sửa schema.

### 2.4 x402 Nanopayments — Agent tự trả tiền cho data
- **Kiến trúc thật, đã verify end-to-end trên ARC Testnet (04/07).** Agent Wallet là EOA (không phải SCA — x402 verify bằng ecrecover, không hỗ trợ ERC-1271).
- Không cần raw private key: `app/lib/x402-signer.ts` gọi `circleClient.signTypedData()` — Circle ký hộ EIP-712 từ xa.
- `app/lib/x402-buyer.ts`: `payX402()` tự động top-up Gateway balance nếu thiếu.
- 5 tool data mà agent tự trả $0.01/lần: `get_token_price` (CoinGecko, giá thật mọi coin), `get_trending_tokens`, `get_defi_data` (DeFiLlama TVL/APY), `get_market_sentiment` (Fear & Greed Index), + market-data gốc.
- UI hiện chip "🔎 -0.01 USDC (live data via x402)", có price chart tương tác (1H/4H/24H), typewriter effect cho tin nhắn agent.
- **Chưa làm:** tin tức crypto (mọi nguồn free đều cần key hoặc bị chặn), margin 30% cho MironPay (đã bàn hướng nhưng chưa code), điều chỉnh địa chỉ contract/facilitator khi lên mainnet.

### 2.5 Swap
- Đã migrate sang SDK chính thức `@circle-fin/swap-kit` (12/07) — dùng `allowanceStrategy: 'permit'` (EIP-2612, không cần tx approve riêng). Build/typecheck pass, estimate đã verify thật (1 USDC ≈ 0.81 EURC).
- **Chưa test thật:** `swapKit.swap()` execute qua UI thật (chỉ mới test estimate).
- Swap modal (`SRSModal.tsx`) đã có UI slippage tương tác đầy đủ, "You pay" và "You receive" đều chọn được token độc lập.
- Chỉ hỗ trợ USDC⇄EURC trên testnet (whitelist cứng) — kế hoạch mainnet: bỏ whitelist, thêm search token theo tên/địa chỉ (chưa code).

### 2.6 Launchpad (IDO)
- Contract `IDOLaunchpad.sol` deploy tại `0x4ae161ba3c1de2012432fa7f5a747c0441ee35e5` trên ARC testnet (v2, có softcap/minRaise + refund — địa chỉ v1 `0xc049f40439bc3e919defe042600bfe56dda50954` đã deprecated, không còn dùng) — 1 contract xử lý tất cả sale, FCFS enforced on-chain thật (không phải backend queue).
- 3 quyết định đã LOCK: (1) mua chỉ qua Agent (không có nút mua trực tiếp), (2) curation hybrid (project nộp form + trả $50 phí + admin duyệt tay), (3) FCFS on-chain qua revert khi đầy cap.
- Toàn bộ UI/API/DB đã build xong, dùng dữ liệu thật 100% (không fabricate).
- **Claim/Vesting extension (LOCKED spec, viết contract xong nhưng CHƯA deploy, CHƯA build phần còn lại):**
  - Contract mới `IDOClaim.sol` (đã viết, chưa deploy) — 1 contract xử lý nhiều sale, đọc `IDOLaunchpad` qua interface.
  - Công thức phân bổ: `userTokens = userContribution * tokensForSale / cap` (cap là mẫu số, không phải totalRaised).
  - TGE anchor = `endTime` on-chain của sale, vesting tính thật: TGE% → cliff → linear release.
  - Vesting params tự khai trong form submit (token address, TGE%, cliff days, vesting months).
  - Claim vẫn agent-only (đúng nguyên tắc agent-centric của sản phẩm).
  - **Việc còn lại:** deploy `IDOClaim.sol` (script đã viết `scripts/deploy-ido-claim.mjs`, chưa chạy), migration DB, các route API, UI claim button. Chờ user gõ "triển đi" mới code tiếp.

### 2.7 Wallet page — "AI Financial OS" redesign
- **13/13 phần đã xong hoàn toàn** (06/07/2026): Portfolio card, Main/Agent Wallet card reframe, Gateway card, Receive panel, Holdings table, Network card, Recent Activity, AI Dashboard card mới, Quick Actions, Wallet Security section, Pending Transactions, hierarchy pass cuối.
- Nguyên tắc xuyên suốt: không fabricate data — mọi chỗ thiếu backend đều đánh dấu `// TODO` rõ ràng thay vì bịa số.
- Sau đó còn 17 "Round" chỉnh sửa landing page riêng (xem mục 5) + vài round trên Wallet/Dashboard page (Round 14-17: dọn dashboard, "Recent activity" panel rework 2 lần).

### 2.8 Miron Score — gamification
- 6 bước đã code xong hoàn toàn: DB schema, score calculation API, tích hợp vào mọi tx flow, login streak, UI (mobile card + desktop leaderboard panel), unlock system (agent daily limit tăng theo level).
- Level: Newcomer → Builder → Trader → Elite, mỗi level tăng daily limit + giảm phí swap + early access IDO.

### 2.9 Bảo mật đã có
- `MironSpendingLimit` contract on-chain (`0xcb5249bb7489ad1931dd2ab446a14d628b02d9b8`) — giới hạn chi tiêu/ngày cho Agent Wallet, số dùng hôm nay track ở Supabase (KHÔNG on-chain), số giới hạn đọc từ contract làm nguồn thật.
- Swap đã fix (08/07): không tính vào daily spending limit nữa (giống Gateway deposit/withdraw — tiền không rời custody).
- Agent chỉ soạn nháp, KHÔNG BAO GIỜ tự thực thi payment/transfer/payroll — người thật luôn phải xác nhận (quy tắc cứng).

### 2.10 Branding
- Logo thật đã thay placeholder ở Sidebar/Login/Landing + favicon (06/07), theme-aware qua CSS class, không cần JS state.

---

## 3. Việc CHƯA làm — theo độ ưu tiên (từ memory `project_pending_features`)

### HIGH — làm sớm
1. **Contract Allowlist cho Agent Wallet** (bảo mật thêm lớp) — hiện `MironSpendingLimit` chỉ chặn theo số tiền/ngày, KHÔNG chặn theo contract nào được gọi. Đã research kỹ (10/07): **Circle Agent Stack KHÔNG dùng được** (kiến trúc ví khác — MPC user-controlled thay vì Developer-Controlled EOA, cần OTP người dùng thật mỗi lần set policy, phá mô hình tự động của MironPay). → Hướng đã chọn: **tự viết thêm allowlist vào `MironSpendingLimit` contract**. Chưa bắt đầu code, gác lại ưu tiên UI trước (xem mục 4).
2. **Transaction Memo** — optional note field cho Send flow, contract đã deploy sẵn (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`), chỉ cần wire UI + gọi contract fire-and-forget sau khi send thành công.
3. **Real-time Balance** — thay polling 30s bằng subscribe 6 event streams on-chain (Native USDC/ERC-20 USDC/EURC/Memo/CCTP in/out), option Supabase Realtime hoặc WebSocket RPC trực tiếp.

### MEDIUM — chờ user bảo mới làm
4. **Bridge Kit** — nạp USDC từ Ethereum Sepolia/Solana Devnet vào ARC (package `@circle-fin/bridge-kit` đã có sẵn trong `@circle-fin/app-kit`, chưa wire UI).
5. **Modular Wallets + Passkey** — thay PIN bằng Face ID/Touch ID/Windows Hello, cần Client Key riêng từ Circle Console.
6. Đã hoàn thành: Swap KIT_KEY (mục 2.5).

### LOW — tương lai xa
7. Unified Balance/Gateway — gộp USDC nhiều chain vào 1 pool, delegate pattern cho agent tự spend.
8. Chainlink Data Feed thay CoinGecko cho pricing — **CHƯA dùng được trên ARC Testnet** (feed chỉ có trên ARC Mainnet, đã verify RPC call thật 04/07 — contract không tồn tại trên testnet). Phải chờ đến khi MironPay lên mainnet.

---

## 4. Ưu tiên hiện tại (quyết định 10/07/2026, vẫn còn hiệu lực)

**User đã chốt: hoàn thiện UI desktop + mobile (PWA) trước, gác lại Contract Allowlist/bảo mật và các HIGH priority khác (Memo, Real-time Balance).**

- Brief PWA đã đóng gói đầy đủ ở `PWA_DESIGN_BRIEF.md` (brand tokens, icon assets ở `logo/`, route inventory, PWA checklist).
- Đang chờ thiết kế từ "Claude Design" tool riêng — vai trò Claude Code trong luồng này CHỈ code nối logic theo đúng thiết kế nhận được, không tự sáng tạo UI.
- Có thư mục `design_handoff_mironpay_pwa/` mới xuất hiện trong git status — có vẻ đã nhận được handoff design, nhưng đây là trạng thái vào lúc bắt đầu conversation này, cần confirm với user xem đã bắt đầu code phần PWA chưa.

---

## 5. Landing page — lịch sử chỉnh sửa chi tiết (14/07, ~17 vòng cùng ngày)

Landing page đã trải qua rất nhiều vòng lặp thiết kế trong 1 phiên (07/07 và 14/07):
- Xoá claim/stats giả (audit đã tìm và xoá "audited by OtterSec/Halborn" — không có thật, "$4.24M volume/18.4K wallets" — bịa).
- Đổi headline "Your keys. Your USDC. / Non-custodial" → "Your PIN. Your approval. / Circle-secured wallets" (đúng thực tế: Circle Developer-Controlled Wallets, không phải non-custodial).
- Thêm rồi xoá lại nhiều lần: Business section, MoreSection (Swap/Launchpad/Score), X402Section riêng — cuối cùng chốt: x402 story chỉ sống trong 1 dòng chat demo (`Paid $0.01 USDC · x402`), không có card/section riêng.
- Thêm banner 3D coins rơi (Three.js qua iframe) ở Hero — fix nhiều bug (full-width breakout CSS, text-overlap qua SVG mask kỹ thuật, scrim overlay).
- Google button đổi thành monochrome + hover màu thật.
- Fix light mode hoàn toàn broken (trang dùng hex cứng, không đọc CSS var theo theme) — đã thêm đầy đủ token `--lp-*` cho cả 2 theme.
- Page order cuối cùng: Hero → SendSection → Features → AgentSection(+x402 tích hợp) → Security → Transparency → CTA → Footer.
- **Quy tắc học được:** mỗi lần sửa `globals.css`, Turbopack đôi khi không hot-reload đúng — phải sửa thật nội dung file (không chỉ touch mtime) để force recompile.

---

## 6. Ý tưởng đã brainstorm nhưng CHƯA code (để bàn tiếp)

### 6.1 Lucky Pool (đã gỡ khỏi code 05/07)
- Cơ chế gốc: mỗi tin nhắn góp phí vào pool chung, win_chance tăng theo streak (max 10%), trúng thưởng rút từ pool.
- Lý do gỡ: đang xây trên nền ảo (chỉ tracking DB, không có giao dịch on-chain thật) trong khi phí tin nhắn đã chuyển sang tiền thật.
- DB tables vẫn còn nguyên (`lucky_pool`, `lucky_wins`), an toàn để bật lại.
- Nếu làm lại cần quyết định: pool ảo hay pool thật, tiền thưởng lấy từ đâu, cần thêm bước `circleClient.createTransaction()` thật để trả thưởng (hiện chưa có bước này).

### 6.2 Payroll / "Lương sống" (Living Payroll)
- Ý tưởng đã chốt hướng (06/07): kết hợp lương chảy real-time (hiển thị) + phiếu lương on-chain xác thực từng đợt (chốt thật 1 lần/ngày) + dashboard sức khỏe payroll cho employer.
- Cơ chế: khoá đủ tiền trước → số hiển thị chảy mượt real-time (chỉ tính toán hiển thị) → chốt tiền thật 1 lần/ngày → sinh bằng chứng on-chain → cuối tháng gộp phiếu lương.
- **5 vấn đề khó chưa có lời giải** (ưu tiên giải quyết #1, #2 trước vì liên quan mất tiền không thể lấy lại):
  1. Gõ sai địa chỉ ví = mất tiền vĩnh viễn — hướng: bắt buộc chọn từ danh bạ, gửi thử số nhỏ trước.
  2. Tiền "đã khoá" thực sự nằm ở đâu — cần rời khỏi quyền kiểm soát thường nhưng vẫn có đường rút an toàn.
  3. Ai giám sát job tự động chạy mỗi đêm — cần lớp giám sát riêng đủ tin cậy.
  4. Ranh giới "bất thường" để tự dừng lịch — cần tinh chỉnh dần theo thực tế.
  5. Luật lao động có thể không cho phép "lương chảy" tự do — cần kiểm tra pháp lý thật, không đoán được.
- Agent CHỈ soạn nháp, không bao giờ tự thực thi (nguyên tắc cứng).
- Vẫn ở giai đoạn brainstorm — chưa chọn xong cách giải quyết 5 vấn đề trên, chưa viết dòng code nào.

### 6.3 AEON — Scan & Pay (crypto → VND qua VietQR)
- Research API thật của AEON (aeon.xyz) — hạ tầng thanh toán cho "AI Agent economy", đối tác Bitget Wallet/Bybit/KuCoin.
- Đã test thật sandbox: giải mã QR VietQR thật, tồn tại `appId=TEST000001`, phát hiện bug thật trong docs AEON (ví dụ ký sai).
- **Chặn hiện tại:** cần secret thật từ AEON support (đã soạn email báo bug + xin secret, user tự gửi).
- **Update 13/07:** AEON có 2 hướng — "User Wallet Payments" (đã có sẵn, ví user tự trả) và "AI Agent Wallet Payments" (đúng mô hình Agent Wallet của MironPay nhưng **CHƯA LAUNCH** theo docs AEON). Đáng theo dõi vì roadmap trùng hướng.

### 6.4 Swap mainnet token search
- Khi lên mainnet: bỏ whitelist cứng `{USDC, EURC}`, thêm search box theo tên/paste địa chỉ contract, badge Verified/Unverified. Chưa code.

### 6.5 Arc x Chainlink — use case tương lai
- 4 use case đã brainstorm: (1) `/swap` pricing thật thay 15% slippage mặc định — ưu tiên làm trước; (2) agent trả lời có căn cứ qua Data Feeds miễn phí thay vì mock; (3) CCIP cross-chain send/receive (khác CCTP hiện tại); (4) Proof of Reserve → trust badge UI.
- **Bị chặn:** feed chỉ có trên ARC Mainnet, chưa deploy trên Testnet — phải chờ MironPay lên mainnet.

### 6.6 ARC Privacy Sector (APS) — confidential EVM
- Chưa available trên testnet, đang roadmap của ARC.
- Ứng dụng tiềm năng: confidential payment, private balance, private Agent Wallet balance, escrow kín, payroll ẩn danh người nhận.
- Khi available có thể offer "Private Mode" toggle mà không cần viết lại contract logic (reuse bytecode EVM thường).

---

## 7. Bug đã biết, CHƯA fix (từ audit 05/07, vẫn còn tồn đọng — user chủ động chọn ưu tiên UI trước)

1. **[Nghiêm trọng — bảo mật] PIN không được verify ở server.** `/api/wallet/transfer` và `/api/wallet/swap` chỉ check Supabase bearer token, không có cơ chế nào liên kết với bước nhập PIN ở `/api/auth/pin/verify` — ai có access token hợp lệ (lộ, XSS, replay) có thể bypass màn hình PIN gọi thẳng transfer. Đề xuất fix: PIN verify trả về short-lived signed token (~60s), transfer/swap bắt buộc verify token đó.
2. **[Cao] Race condition đóng modal giữa chừng.** `SRSModal.tsx` không có `AbortController`, fetch cũ resolve trễ vẫn ghi đè state của giao dịch mới mở sau đó.
3. **[Trung bình] Swap hiện nhầm icon Send/Receive** trong Recent Activity — do description backend luôn là "Received"/"Sent", không bao giờ chứa "swap".
4. **[Thấp] Local optimistic transactions không tách theo user** — dùng key localStorage cố định, máy dùng chung có thể lộ tx pending của người trước trong 10 phút.

---

## 8. Quy tắc làm việc cố định giữa user và Claude (rất quan trọng, luôn áp dụng)

1. **Xác nhận trước khi code** — với bug/task không tầm thường, phải nói rõ hiểu vấn đề gì + hướng fix, chờ user xác nhận rồi mới sửa code. Không suy diễn "go-ahead" từ ngôn ngữ khẩn cấp/ưu tiên — chỉ những câu nói rõ như "triển đi"/"làm đi" mới cho phép bắt đầu code.
2. **Không tự redesign từ đầu** — phân tích code hiện có trước, tái dùng component/style/kiến trúc sẵn có, tập trung vào UX/logic thay vì visual reinvention, lập kế hoạch trước khi code các tính năng không tầm thường.
3. **Không bao giờ bịa dữ liệu** — thiếu backend thì dùng placeholder + `// TODO` rõ ràng, không tự nghĩ ra số/text trông như thật.
4. **Nhận ảnh thiết kế → chỉ phân tích + hỏi trước, không tự code**, kể cả không được nhắc lại rule.
5. **Toàn bộ UI/code phải tiếng Anh chuyên nghiệp**, dù hội thoại là tiếng Việt.
6. **Agent AI không bao giờ tự thực thi hành động chuyển tiền** (payroll/payment/transfer) — chỉ soạn nháp, người thật luôn xác nhận cuối.
7. **Lưu memory chủ động**, không chờ user nhắc "ghi nhớ".

---

## 9. Việc tồn đọng khác

- **~40 file còn sót comment tiếng Việt** trong code (9 file đã dọn 12/07) — danh sách đầy đủ file trong memory `project_vietnamese_comments_cleanup`. Lưu ý: từ khoá tiếng Việt trong `chat/route.ts` để agent nhận diện input là logic xử lý, KHÔNG dịch.
- **3 kiểu PIN implementation không đồng nhất** trong code (`PinVerifyModal`, `SRSModal` inline `PinPad`, onboarding setup-pin) — cần hợp nhất trong 1 đợt dev sau này (không chỉ đợt design).
- File `.evn.local` bị đặt tên sai chính tả (đáng lẽ `.env.local`) — biết vậy để không nhầm khi tìm file.

---

## 10. Địa chỉ contract quan trọng (ARC Testnet)

Đã verify source code trên testnet.arcscan.app (25/07/2026): Memo, MironSpendingLimit, IDOLaunchpad v2.

| Contract | Address |
|---|---|
| USDC (native+ERC20) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Memo Contract | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |
| MironSpendingLimit | `0xcb5249bb7489ad1931dd2ab446a14d628b02d9b8` |
| IDOLaunchpad (v2, softcap+refund — active) | `0x4ae161ba3c1de2012432fa7f5a747c0441ee35e5` |
| IDOLaunchpad (v1, deprecated — unreachable, kept for history) | `0xc049f40439bc3e919defe042600bfe56dda50954` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Gateway Wallet (testnet) | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Project/Agent Owner Wallet | `0x7a3bc75bbc8d7022897a11632f7a7b90567a004e` |
| Miron Agent ID (on-chain) | `#840671` |

Domain: **mironpay.xyz** | Explorer: `testnet.arcscan.app`

---

*Tài liệu này tổng hợp từ toàn bộ memory làm việc với Claude Code tính đến 14/07/2026. Nếu tiếp tục làm với Claude khác, gửi file này để có đầy đủ ngữ cảnh mà không cần giải thích lại từ đầu.*
