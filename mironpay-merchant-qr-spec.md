# MironPay Merchant QR — Spec v1 (Mobile)

Tài liệu này mô tả flow + logic cho tính năng thanh toán QR phía cửa hàng và phía khách, trên mobile (PWA).

---

## 1. Phạm vi v1

**Có trong v1:**
- QR động (mỗi đơn một mã riêng, có số tiền + mã đơn)
- Một cửa hàng, một thu ngân
- Thanh toán USDC trên Arc
- Tự động khớp đơn qua memo
- Lịch sử bán hàng theo ngày

**KHÔNG có trong v1:**
- Tích hợp phần mềm bán hàng / POS
- Nhiều thu ngân, phân quyền nhân viên
- Hoàn tiền tự động
- Dashboard desktop, báo cáo phân tích
- Hiển thị song tệ VND/USDC
- QR tĩnh in dán quầy

---

## 2. Mô hình dữ liệu

### Merchant

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `merchant_id` | uuid | |
| `user_id` | uuid | Chủ tài khoản MironPay |
| `name` | string | Tên cửa hàng hiển thị cho khách |
| `logo_url` | string | Có thể null |
| `receive_address` | string | Ví nhận tiền, mặc định = ví User |
| `is_active` | bool | |
| `created_at` | timestamp | |

### Order

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `order_id` | string | Duy nhất toàn hệ thống, dùng làm memo |
| `merchant_id` | uuid | |
| `amount` | decimal | Số tiền USDC yêu cầu |
| `amount_received` | decimal | Thực nhận, mặc định 0 |
| `status` | enum | Xem mục 3 |
| `created_at` | timestamp | |
| `expires_at` | timestamp | `created_at + 3 phút` |
| `paid_at` | timestamp | null nếu chưa trả |
| `tx_hash` | string | null nếu chưa trả |
| `payer_address` | string | null nếu chưa trả |

**Quy tắc `order_id`:** phải ngắn (memo on-chain có giới hạn độ dài), duy nhất, không đoán được tuần tự. Gợi ý: 8–12 ký tự alphanumeric random. Không dùng số tăng dần vì lộ số đơn của cửa hàng.

**Quan trọng cho tương lai:** Order không bao giờ bị xoá hoặc ghi đè. Mọi thay đổi trạng thái đều giữ timestamp. Đây là điều kiện để sau này dựng được báo cáo thống kê.

---

## 3. Trạng thái đơn hàng

| Trạng thái | Ý nghĩa | Chuyển tiếp được |
|---|---|---|
| `pending` | QR đã sinh, đang chờ trả | → `paid`, `underpaid`, `expired`, `cancelled` |
| `paid` | Nhận đủ (hoặc thừa), memo khớp | cuối |
| `underpaid` | Có tiền vào nhưng thiếu | → `paid` (khách trả bù), hoặc thu ngân chấp nhận → cuối |
| `expired` | Quá hạn không ai trả | cuối |
| `cancelled` | Thu ngân chủ động huỷ | cuối |

**Luật:** trạng thái cuối là bất biến. Không sửa, không xoá.

---

## 4. Định dạng QR

QR chứa một payment URI gồm 3 thành phần:

- Địa chỉ ví nhận (`receive_address` của merchant)
- Số tiền (`amount`)
- Mã tham chiếu (`order_id`) → đi vào memo

**Quyết định cần chốt:** dùng chuẩn URI thanh toán phổ biến (dạng EIP-681) để ví ngoài cũng quét được, hay dùng scheme riêng của MironPay.

Khuyến nghị: **dùng chuẩn mở.** Ví ngoài trả được (không có memo, phải xác nhận tay), ví MironPay trả được với đầy đủ trải nghiệm tự động. Vừa mở rộng được phạm vi nhận tiền, vừa giữ lý do để cửa hàng khuyên khách dùng MironPay.

---

## 5. Logic khớp đơn (backend)

Đây là lõi kỹ thuật của tính năng.

1. Lắng nghe giao dịch USDC vào `receive_address` của merchant (event log trên Arc)
2. Với mỗi giao dịch đến, đọc memo
3. Tìm Order có `order_id` khớp memo **và** `status = pending`
4. Nếu tìm thấy:
   - `amount_received >= amount` → `paid`
   - `amount_received < amount` → `underpaid`
   - Ghi `tx_hash`, `payer_address`, `paid_at`
5. Nếu không tìm thấy Order khớp (ví ngoài trả, hoặc memo rỗng):
   - Không tự gán vào đơn nào
   - Đẩy thông báo "có giao dịch chưa xác định" lên màn thu ngân để xác nhận tay
6. Nếu Order đã `expired` mà tiền vẫn về:
   - Vẫn ghi nhận giao dịch
   - Hiện thông báo riêng, KHÔNG bỏ qua âm thầm

**Cơ chế đẩy về client:** ưu tiên realtime subscription (Supabase Realtime) thay vì polling, để M3 phản hồi tức thì.

---

## 6. Flow phía thu ngân (Merchant)

### M1 — Thiết lập cửa hàng (một lần)

**Mục đích:** tạo Merchant profile trước khi bán.

**Nội dung màn:**
- Ô nhập tên cửa hàng (bắt buộc)
- Chọn ảnh/logo (tuỳ chọn)
- Hiển thị ví nhận, mặc định là ví User hiện tại, cho phép đổi
- Nút "Kích hoạt chế độ cửa hàng"

**Sau khi xong:** tab Merchant xuất hiện trong app.

---

### M2 — Màn hình chính (bàn phím số)

**Màn mặc định khi mở tab Merchant.**

**Nội dung màn:**
- Trên cùng: tổng doanh thu hôm nay + số đơn hôm nay
- Giữa: số tiền đang nhập, **font rất lớn**
- Dưới: bàn phím số, nút xoá
- Nút chính "Tạo mã thanh toán" — to, đặt nửa dưới màn hình
- Nút phụ vào M5 (Lịch sử)

**Logic:**
- Nút "Tạo mã" disabled khi số tiền = 0
- Bấm "Tạo mã" → tạo Order `pending`, sinh `order_id` và `expires_at` → chuyển M3

---

### M3 — Màn chờ thanh toán ★ MÀN QUAN TRỌNG NHẤT

**Nội dung màn:**
- Số tiền, font lớn, trên cùng
- QR chiếm phần lớn diện tích màn hình
- Đồng hồ đếm ngược `3:00`
- Nút "Huỷ đơn" — cỡ nhỏ, đặt xa vùng bấm nhầm

**Logic:**
- Lắng nghe realtime trạng thái Order
- `paid` → chuyển M4 **kèm âm thanh + rung**
- `underpaid` → hiện cảnh báo vàng ngay trên M3: "Nhận được X/Y USDC", kèm 2 lựa chọn: "Chấp nhận" (→ M4) hoặc "Chờ trả thêm" (giữ M3, gia hạn)
- Hết giờ → `expired`, hiện thông báo, quay về M2
- Bấm "Huỷ" → dialog xác nhận → `cancelled` → về M2

**Yêu cầu thiết kế:**
- QR nền trắng thuần, tương phản cao (màn hình có thể bị chìa ra ngoài nắng)
- QR đủ lớn để quét từ khoảng cách ~50cm
- Không cho màn hình tự tắt khi đang ở M3

**Trạng thái mất mạng:**
- Hiện dải cảnh báo "Mất kết nối", giữ nguyên QR và đồng hồ
- Có mạng lại → tự động kiểm tra lại trạng thái Order (đơn có thể đã được trả trong lúc mất mạng)

---

### M4 — Thanh toán thành công

**Nội dung màn:**
- Dấu tích lớn, màu thành công
- Số tiền đã nhận
- Địa chỉ ví người trả (rút gọn)
- Giờ thanh toán
- Nút chính: "Đơn tiếp theo" (to)
- Nút phụ: "Xem chi tiết"

**Logic:** tự động quay về M2 sau 5 giây nếu không thao tác.

---

### M5 — Lịch sử bán hàng

**Nội dung màn:**
- Đầu danh sách: tổng tiền + số đơn của ngày đang xem
- Chọn ngày
- Danh sách đơn, mới nhất trên cùng: giờ, số tiền, trạng thái (phân biệt bằng màu)
- Bấm một đơn → chi tiết: `order_id`, số tiền yêu cầu, số tiền nhận, tx hash (bấm mở explorer), ví người trả, các mốc thời gian

---

## 7. Flow phía khách (Customer)

### C1 — Quét mã

Camera mở, khung quét ở giữa. Có nút chọn ảnh QR từ thư viện.

---

### C2 — Xác nhận thanh toán ★ MÀN QUYẾT ĐỊNH NIỀM TIN

**Thứ tự hiển thị từ trên xuống (đúng theo mức độ ưu tiên):**

1. Logo + **tên cửa hàng** — lớn nhất trên màn. Đây là thứ khách dùng để xác minh, không phải địa chỉ ví.
2. Số tiền
3. Số dư ví hiện tại của khách
4. Phí mạng ước tính
5. Nút "Xác nhận thanh toán"

**Logic:**
- Merchant có trong hệ thống MironPay → hiện badge xác thực
- QR trỏ tới địa chỉ lạ không thuộc merchant nào → **hiện cảnh báo rõ ràng**, hiện full địa chỉ, không cho qua âm thầm
- Số dư không đủ → disable nút, gợi ý nạp/swap
- QR đã hết hạn → báo "Mã đã hết hạn, đề nghị cửa hàng tạo lại"

---

### C3 — Đang xử lý

Loading, chặn nút quay lui.

**Ghi chú:** nếu Arc confirm dưới ~2 giây, màn này gần như chớp qua và có thể gộp vào C2. Cần đo thực tế trên testnet để quyết định.

---

### C4 — Thành công

Dấu tích lớn, số tiền, tên cửa hàng, giờ. Link xem trên explorer. Nút "Xong".

---

## 8. Tình huống biên (bắt buộc xử lý)

| Tình huống | Xử lý |
|---|---|
| Khách trả thiếu | `underpaid`, thu ngân quyết định chấp nhận hay chờ trả bù |
| Khách trả thừa | Vẫn `paid`, ghi rõ số dư thừa trong chi tiết đơn |
| Khách quét rồi bỏ đi | Hết 3 phút → `expired` |
| Tiền về sau khi đơn hết hạn | Vẫn ghi nhận, thông báo riêng cho thu ngân, không bỏ qua |
| Ví ngoài trả (không memo) | Không tự khớp, hiện "giao dịch chưa xác định" để xác nhận tay |
| Mất mạng phía thu ngân | Giữ QR, hiện cảnh báo, có mạng lại thì đồng bộ lại trạng thái |
| Hai đơn cùng số tiền cùng lúc | Không nhầm được, vì khớp theo `order_id` chứ không theo số tiền |
| Thu ngân bấm huỷ đúng lúc khách đang trả | Kiểm tra lại trạng thái trước khi huỷ; nếu tx đã lên mạng thì không cho huỷ |

---

## 9. Ghi chú thiết kế giao diện

- **M2 và M3 được dùng hàng trăm lần mỗi ngày.** Ưu tiên: số to, nút to, ít thao tác nhất có thể.
- Thu ngân cầm điện thoại một tay → nút chính luôn đặt ở nửa dưới màn hình.
- **Phản hồi thanh toán thành công phải nghe được**, không chỉ nhìn được. Thu ngân không nhìn màn hình liên tục; họ nghe tiếng báo rồi đưa hàng cho khách. Đây là chi tiết quyết định tính dùng được thật.
- M3 có thể bị chìa ra ngoài nắng → tương phản cao.
- C2 ưu tiên tên cửa hàng hơn mọi thông tin khác. Khách không đọc địa chỉ ví, và cũng không nên bắt họ đọc.

---

## 10. Câu hỏi còn treo

1. **Thời gian confirm của Arc?** — quyết định C3 có cần tồn tại không, và M3 → M4 có cần trạng thái trung gian không. **Cần đo trên testnet trước khi thiết kế xong hai màn này.**
2. **Chuẩn QR:** dùng URI mở (EIP-681) hay scheme riêng. Khuyến nghị dùng chuẩn mở.
3. **Giới hạn độ dài memo trên Arc** — quyết định độ dài `order_id`.
4. **Thời gian hết hạn 3 phút** — con số giả định, nên điều chỉnh sau khi thử thực tế.
