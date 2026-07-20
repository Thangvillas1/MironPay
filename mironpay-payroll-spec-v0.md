# MironPay Payroll — Spec Tối Giản (v0)

Bản rút gọn nhất còn chạy được thật. Mục tiêu: chi lương hàng loạt bằng USDC trên Arc, có kiểm tra an toàn, chủ doanh nghiệp ký một lần.

---

## 1. Nguyên tắc

1. **Code đọc file, không dùng AI để trích xuất.** File Excel/CSV có cấu trúc thì `pandas`/`openpyxl` đọc chính xác tuyệt đối. Dùng LLM ở đây là tự tạo rủi ro.
2. **Ví lấy từ hồ sơ nhân viên, không lấy từ file.** File hàng tháng chỉ mang số tiền. Đây là biện pháp chống mất tiền quan trọng nhất, vì on-chain không hoàn tác được.
3. **Sửa chữa chỉ xảy ra khi còn Draft.** Đã ký thì đóng băng, đã chi thì khoá vĩnh viễn.

---

## 2. Phạm vi v0

**Có:**
- Danh sách nhân viên (tạo một lần)
- Upload file số tiền hàng tháng
- Kiểm tra lỗi cứng
- Màn duyệt + ký một lần
- Chi hàng loạt, xử lý lỗi từng dòng

**KHÔNG có:**
- Thuế, khấu trừ, bảo hiểm, form thuế
- FX / quy đổi tiền tệ (file ghi thẳng USDC)
- AI phát hiện bất thường
- Phân quyền nhiều cấp, nhiều phòng ban
- Lịch trả định kỳ tự động
- Payslip, cổng nhân viên

---

## 3. Mô hình dữ liệu

### Employee

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `employee_id` | string | Mã do công ty tự đặt — khoá khớp với file |
| `company_id` | uuid | |
| `name` | string | |
| `wallet_address` | string | Nhập một lần, xác nhận kỹ |
| `is_active` | bool | Nghỉ việc thì set false, **không xoá** |
| `created_at` | timestamp | |

### PayRun

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `run_id` | uuid | |
| `company_id` | uuid | |
| `period` | string | VD `2026-07` |
| `status` | enum | Xem mục 4 |
| `file_hash` | string | Hash file gốc, để đối chiếu |
| `total_amount` | decimal | |
| `employee_count` | int | |
| `created_at` / `approved_at` / `paid_at` | timestamp | |

### PayRunItem

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `item_id` | uuid | |
| `run_id` | uuid | |
| `employee_id` | string | |
| `wallet_address` | string | **Snapshot lúc approve**, không tham chiếu động |
| `amount` | decimal | |
| `status` | enum | `pending` / `sent` / `confirmed` / `failed` |
| `tx_hash` | string | |

---

## 4. Trạng thái PayRun

| Trạng thái | Sửa được? | Ý nghĩa |
|---|---|---|
| `draft` | Có | Đang chuẩn bị, upload lại thoải mái |
| `approved` | Không | Đã ký, payload đóng băng |
| `processing` | Không | Đang phát lệnh on-chain |
| `paid` | Khoá vĩnh viễn | Tất cả thành công |
| `partially_paid` | Chỉ retry dòng lỗi | Một số nhân viên chưa nhận |
| `cancelled` | — | Huỷ khi còn draft |

**Luật:** đã `paid` thì không sửa. Sai sót phát hiện sau → tạo run điều chỉnh mới.

---

## 5. Flow

### P1 — Quản lý nhân viên (làm một lần)

**Thêm nhân viên:** nhập `employee_id`, tên, địa chỉ ví.

**Xác nhận ví (bắt buộc):**
- Hiện **full địa chỉ**, không rút gọn
- Kiểm tra checksum
- Yêu cầu tick xác nhận "Tôi đã kiểm tra địa chỉ này"

**Đổi ví:** là hành động riêng, có cảnh báo, ghi log. Đây là điểm tấn công kinh điển — kẻ xấu không sửa số tiền, chỉ sửa địa chỉ ví.

**Màn hình:** danh sách nhân viên, tìm kiếm, nút thêm, nút import CSV hàng loạt lần đầu.

---

### P2 — Tạo kỳ lương + Upload

**Template file — chỉ 2 cột bắt buộc:**

```
employee_id, amount
NV001, 1500
NV002, 2200
NV003, 1800
```

Cột `note` là tuỳ chọn. **Không có cột ví, không có cột tên** — hai thứ đó lấy từ P1.

**Logic:**
- Tạo PayRun `draft`
- Lưu file gốc + hash
- Một kỳ chỉ có một run đang mở. Muốn làm lại → huỷ run cũ, tạo mới. Không ghi đè.

---

### P3 — Parse + Kiểm tra

**Parse (code thuần):** đọc file, khớp `employee_id` với danh sách nhân viên để lấy ví.

**Sai template → dừng ngay**, báo rõ dòng nào sai. Không đoán, không tự sửa.

**Lỗi cứng — còn lỗi thì cấm ký:**

| Lỗi | Kiểm tra |
|---|---|
| `employee_id` không có trong hệ thống | Không tự thêm, bắt khai báo trước |
| Nhân viên đã inactive | Vẫn có trong file |
| Trùng `employee_id` | Trong cùng file |
| Số tiền ≤ 0, rỗng, không phải số | |
| Địa chỉ ví sai checksum | |
| Tổng chi + phí > số dư ví công ty | Kiểm tra ngay, không đợi lúc chi |

---

### P4 — Màn duyệt (HR xem)

Bảng đầy đủ từng dòng: `employee_id`, tên, ví (rút gọn), số tiền. Lỗi tô đỏ. Tổng cộng ở cuối.

**Còn lỗi đỏ → nút "Gửi duyệt" bị khoá.** Sửa file rồi upload lại → parse lại từ đầu, run vẫn `draft`.

---

### P5 — Màn ký (chủ doanh nghiệp)

**Chỉ hiển thị summary, không hiện bảng tính:**
- Kỳ lương
- Số nhân viên
- Tổng tiền
- Phí mạng ước tính
- Số dư ví công ty sau khi chi
- Nút "Duyệt & Ký"

Có nút mở bảng chi tiết, nhưng mặc định là summary.

**Snapshot khi bấm ký — điểm quan trọng nhất:**
Toàn bộ danh sách ví + số tiền được đóng băng vào `PayRunItem`. Sau khoảnh khắc này:
- Sửa ví trong danh sách nhân viên **không** ảnh hưởng run đã ký
- Upload file mới **không** ghi đè
- Muốn thay đổi → huỷ run, làm lại từ đầu

---

### P6 — Chi tiền

**Pre-flight (ngay trước lệnh đầu tiên):**
- Số dư còn đủ không
- Gas đủ không
- Mọi địa chỉ vẫn hợp lệ

Thiếu bất kỳ điều kiện nào → **không phát lệnh nào cả**.

**Trong lúc chạy:** mỗi `PayRunItem` có trạng thái riêng, lưu `tx_hash` từng dòng.

**Kết thúc:**
- Tất cả `confirmed` → run `paid`
- Có dòng `failed` → run `partially_paid`

**Xử lý lỗi từng phần:**
- Hiện danh sách nhân viên chưa nhận được
- Cho phép **retry riêng những dòng lỗi**
- **Tuyệt đối không chạy lại cả run** — sẽ trả trùng, mất tiền thật

Đây là tình huống bình thường on-chain, không phải ngoại lệ hiếm. Phải thiết kế tử tế ngay từ đầu.

---

### P7 — Lịch sử

Danh sách các kỳ lương: kỳ, số người, tổng tiền, trạng thái, ngày chi. Bấm vào → chi tiết từng dòng kèm tx hash mở explorer được.

---

## 6. Câu hỏi chặn — phải trả lời trước khi code

1. **Arc có hỗ trợ batch payment / multicall không?**
   - **Có** → một chữ ký authorize cả batch, đúng như thiết kế P5
   - **Không** → cần cơ chế uỷ quyền: chủ doanh nghiệp ký một lần cho phép chi đúng payload đã snapshot, hệ thống phát N giao dịch. Không thể bắt ký 200 lần.

   Đây là câu chặn P5 và P6. **Xác nhận trước khi làm gì khác.**

2. **Người nhận có cần tài khoản MironPay không**, hay chi thẳng vào địa chỉ ví bất kỳ? Bản v0 nên chọn chi thẳng vào địa chỉ ví — đơn giản nhất, không cần onboard nhân viên.

---

## 7. Lộ trình sau v0

Theo thứ tự giá trị:

1. **AI kiểm tra bất thường** — lương lệch mạnh so kỳ trước, nhân viên biến mất khỏi danh sách, người nhận lần đầu. Đây mới là phần làm nên chữ "AI" trong sản phẩm.
2. **Payslip có tx hash** — nhân viên tự verify on-chain, không phải tin PDF của HR. Đây là điểm web3 hơn hẳn web2.
3. FX / quy đổi VND
4. Lịch trả định kỳ
5. Nhiều cấp duyệt, nhiều phòng ban
6. Trợ lý AI hỏi đáp trên lịch sử lương
