# SPEC

> Nền tảng kết nối **người có ô tô nhàn rỗi** với **người cần thuê xe tự lái** tại Việt Nam.

---

## 1. Phạm vi

|            | Trong phạm vi                                           | Ngoài phạm vi                    |
| ---------- | ------------------------------------------------------- | -------------------------------- |
| Thị trường | Việt Nam, giao diện tiếng Việt, tiền VND                | Đa ngôn ngữ, đa tiền tệ          |
| Loại thuê  | Ô tô tự lái                                             | Thuê kèm tài xế, xe máy          |
| Nền tảng   | Web responsive (desktop + mobile)                       | App iOS/Android                  |
| Chủ xe     | Cá nhân và doanh nghiệp, dùng chung một luồng           | Tích hợp hệ thống quản lý đội xe |
| Bảo hiểm   | Không có, rủi ro được xử lý bằng tiền cọc và tranh chấp | Hợp tác với công ty bảo hiểm     |

## 2. Vai trò

- **Người dùng**: một tài khoản dùng cho cả hai vai trò, vừa có thể thuê xe vừa có thể đăng xe cho thuê.
  - **Người thuê**: muốn đặt xe thì phải có GPLX đã được duyệt.
  - **Chủ xe**: xe chỉ hiển thị công khai sau khi admin duyệt.
- **Admin**: quản trị nền tảng qua **Console** (`/console`).

## 3. Xác minh

| Đối tượng        | Giấy tờ                                                                            | Người duyệt |
| ---------------- | ---------------------------------------------------------------------------------- | ----------- |
| Người thuê       | Ảnh GPLX (mặt trước, mặt sau), họ tên, số GPLX, hạng, ngày hết hạn                 | Admin       |
| Xe **[Đề xuất]** | Ảnh giấy đăng ký xe và giấy đăng kiểm còn hạn. Chỉ admin xem được, không công khai | Admin       |
| Email            | Bắt buộc xác thực bằng link gửi qua email                                          | Tự động     |

Người dùng chưa có GPLX được duyệt vẫn xem và tìm xe bình thường. Họ chỉ bị chặn khi bấm **Đặt xe**.

## 4. Đăng xe (chủ xe)

### 4.1 Thông tin xe

- **Cơ bản**: hãng, dòng xe, năm sản xuất, biển số (công khai sẽ che một phần, ví dụ `51K-***.45`), màu, kiểu thân xe (Sedan, SUV, Crossover, MPV, Hatchback, Bán tải), số chỗ, hộp số (số sàn, tự động), nhiên liệu (xăng, dầu, điện, hybrid), mức tiêu hao (L/100km hoặc kWh/100km), ODO.
- **Ảnh**: ít nhất 4 ảnh, tối đa 15 ảnh, chọn một ảnh làm ảnh bìa.
- **Tiện nghi** (chọn nhiều): bản đồ/định vị GPS, Bluetooth, Apple CarPlay/Android Auto, camera lùi, camera 360, cảm biến va chạm, cảnh báo điểm mù, cửa sổ trời, ghế da, cửa hít, cruise control, cốp điện, cảm biến áp suất lốp, ghế trẻ em, khe cắm USB/sạc, ETC (thu phí không dừng), lốp dự phòng, túi khí.
- **Mô tả** tự do.
- **Quy định xe** (bật/tắt từng mục, có thể ghi chú thêm): không hút thuốc, không chở thú cưng, không chở sầu riêng/hải sản, trả xe với mức nhiên liệu như lúc nhận, giữ vệ sinh xe.
- **Giới hạn km** (tuỳ chọn): số km/ngày và phụ phí cho mỗi km vượt.

### 4.2 Giá. Chủ xe cấu hình linh hoạt

- Chủ xe **bật/tắt** từng đơn vị giá và điền giá cho đơn vị đã bật: **theo giờ**, **theo ngày**, **theo tháng**. Phải bật ít nhất một đơn vị.
- Thời gian thuê tối thiểu và tối đa (ví dụ tối thiểu 4 giờ, tối đa 30 ngày).
- **Phụ phí cuối tuần và ngày lễ** (%, tuỳ chọn).
- **Giảm giá thuê dài** (tuỳ chọn): % giảm khi thuê từ 7 ngày trở lên.
- **Cách hệ thống tính tiền**: chia thời gian thuê thành tháng, ngày và giờ, tính theo các đơn vị đã bật, rồi chọn tổng **rẻ nhất cho người thuê**. Ví dụ: số giờ lẻ đã đắt hơn giá một ngày thì tính tròn một ngày.

### 4.3 Lịch trống **[Đề xuất]**

- Mặc định xe **luôn trống**.
- Chủ xe có thể **chặn** khoảng ngày giờ (xe bận, đi bảo dưỡng) trên lịch.
- Hệ thống tự chặn những khoảng đã có đơn xác nhận. Thêm **thời gian đệm** giữa hai chuyến do chủ xe chọn (mặc định 2 giờ) để vệ sinh xe.
- Đơn **chiếm lịch** khi ở trạng thái CHỜ_THANH_TOÁN, ĐÃ_XÁC_NHẬN hoặc ĐANG_THUÊ, tính từ giờ nhận xe đến giờ trả xe cộng thời gian đệm. Đơn **CHỜ_DUYỆT không chiếm lịch**: nhiều người có thể gửi yêu cầu trùng giờ, chủ xe chấp nhận đơn nào trước thì đơn đó giữ lịch, các yêu cầu trùng còn lại không chấp nhận được nữa. Thời gian đệm được chốt vào đơn lúc đặt.

### 4.4 Giao nhận xe **[Đề xuất]**

- **Nhận tại chỗ**: luôn có. Địa chỉ trên trang công khai chỉ hiển thị **gần đúng** (phường/quận, vòng tròn trên bản đồ). Địa chỉ chính xác hiện ra sau khi đơn được xác nhận.
- **Giao tận nơi** (tuỳ chọn): chủ xe đặt bán kính tối đa (km) và phí giao (đ/km, hoặc miễn phí trong X km).

### 4.5 Chế độ duyệt đơn

Chủ xe chọn cho từng xe:

- **Đặt nhanh**: người thuê thanh toán xong là đơn được xác nhận ngay.
- **Duyệt tay**: chủ xe có **6 giờ** để chấp nhận hoặc từ chối. Hết hạn mà chưa trả lời thì đơn tự huỷ.

### 4.6 Tiền cọc **[Đề xuất]**

- Chủ xe đặt mức cọc, mặc định 5.000.000đ, cho phép từ 0 đến 50.000.000đ.
- Người thuê thanh toán **tiền thuê + phí giao xe + cọc** cùng một lần qua web. Carenta giữ toàn bộ số tiền này.
- Cọc được hoàn **72 giờ sau khi trả xe** nếu không có khiếu nại (xem mục 7).

## 5. Tìm và thuê xe (người thuê)

### 5.1 Tìm kiếm

- **Ô tìm kiếm chính**: địa điểm (tỉnh/thành, quận) cùng thời gian nhận và trả xe.
- **Bộ lọc**: khoảng giá, hãng, kiểu thân xe, số chỗ, hộp số, nhiên liệu, đặt nhanh, giao tận nơi, tiện nghi.
- **Sắp xếp**: giá, đánh giá, khoảng cách, mới nhất.
- **Hai chế độ xem**: danh sách và **bản đồ** (OpenStreetMap + Leaflet, miễn phí).
- Chỉ hiện những xe **trống trong khoảng thời gian đã chọn**.

### 5.2 Trang chi tiết xe

Gồm: bộ ảnh, thông số, tiện nghi, quy định, vị trí gần đúng, bảng giá, lịch trống, hồ sơ chủ xe (đánh giá, tỉ lệ phản hồi, số chuyến), đánh giá của xe. Bên cạnh có **khung đặt xe** tính giá trực tiếp.

### 5.3 Luồng đặt xe

```
Chọn thời gian + hình thức nhận xe
      → Xem tổng tiền chi tiết (thuê, phụ phí, giao xe, cọc)
      → Đồng ý điều khoản và hợp đồng thuê (tự sinh từ dữ liệu đơn)
      → [Đặt nhanh]  Thanh toán → ĐÃ XÁC NHẬN
        [Duyệt tay]  Gửi yêu cầu → chủ xe chấp nhận → thanh toán trong 30 phút → ĐÃ XÁC NHẬN
```

### 5.4 Trạng thái đơn

```
CHỜ_DUYỆT ──(chủ xe chấp nhận)──► CHỜ_THANH_TOÁN ──(thanh toán)──► ĐÃ_XÁC_NHẬN
    │                                   │                                │
    └─(từ chối/hết hạn)─► ĐÃ_HUỶ ◄─(hết 30')                (biên bản nhận xe)
                                                                         ▼
     HOÀN_TẤT ◄──(hết 72h, không khiếu nại)── ĐÃ_TRẢ_XE ◄──(biên bản trả xe)── ĐANG_THUÊ
                                                  │
                                                  └─(chủ xe khiếu nại)─► TRANH_CHẤP ─(admin xử lý)─► HOÀN_TẤT
```

### 5.5 Biên bản giao nhận **[Đề xuất]**

- **Khi nhận xe**: chủ xe hoặc người thuê chụp ảnh 4 góc xe, đồng hồ ODO và mức nhiên liệu, ghi chú vết trầy có sẵn. Bên còn lại bấm **Xác nhận**.
- **Khi trả xe**: làm tương tự. Hệ thống tự tính phụ phí vượt km (nếu xe có giới hạn) và phụ phí trả trễ.
- Ảnh trong biên bản là bằng chứng nếu có tranh chấp.

## 6. Thanh toán, ví và hoa hồng

- **Cổng thanh toán**: **VNPay sandbox** **[Đề xuất]**. Đây là tích hợp thật nhưng dùng tiền giả, hợp với portfolio.
- **Cơ chế ký quỹ**: tiền người thuê trả nằm ở Carenta. Khi đơn **HOÀN_TẤT**:
  - Chủ xe nhận **tiền thuê − hoa hồng** (cùng phụ phí, nếu có) vào **Ví Carenta**.
  - Người thuê được hoàn **cọc** (trừ phần bị trừ do tranh chấp, nếu có).
- **Hoa hồng**: mặc định **15%** trên tiền thuê **[Đề xuất]**. Admin chỉnh được trong Console.
- **Ví Carenta chỉ dành cho chủ xe.** Người thuê không có ví và không rút tiền được.
- **Rút tiền**: chủ xe khai báo tài khoản ngân hàng và gửi **yêu cầu rút** (tối thiểu 100.000đ). Admin duyệt rồi đánh dấu "đã chuyển". Với bản portfolio, bước chuyển khoản là thao tác giả lập.
- **Hoàn tiền cho người thuê** (tiền cọc, tiền huỷ chuyến): hệ thống tự hoàn **về phương thức thanh toán ban đầu** qua API hoàn tiền của VNPay, có thể hoàn toàn phần hoặc một phần.
- Mọi biến động tiền đều được ghi vào **sổ giao dịch** (ledger) để đối soát.

### Chính sách huỷ **[Đề xuất]**, một chính sách chung cho toàn nền tảng

| Ai huỷ     | Thời điểm                     | Người thuê được hoàn                                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Người thuê | Trước giờ nhận xe hơn 48 giờ  | 100% tiền thuê + cọc                                                                        |
| Người thuê | Trước giờ nhận xe 24–48 giờ   | 50% tiền thuê + 100% cọc (chủ xe nhận 50% còn lại sau khi trừ hoa hồng)                     |
| Người thuê | Trước giờ nhận xe dưới 24 giờ | 0% tiền thuê + 100% cọc                                                                     |
| Chủ xe     | Bất kỳ lúc nào                | 100%. Chủ xe bị ghi một lần huỷ trên hồ sơ, huỷ quá 3 lần trong 30 ngày thì xe bị ẩn 7 ngày |

## 7. Cọc, hư hỏng và phạt nguội **[Đề xuất]**

- Trong **72 giờ** sau khi trả xe, chủ xe có thể **mở khiếu nại**: chọn loại (hư hỏng, vệ sinh, nhiên liệu, phạt nguội, khác), số tiền yêu cầu và ảnh bằng chứng.
- Người thuê **phản hồi** trong 48 giờ: đồng ý hoặc phản bác kèm bằng chứng.
- **Admin quyết định** số tiền trừ vào cọc. Phần cọc còn lại được hoàn cho người thuê.
- Phạt nguội phát hiện sau 72 giờ: chủ xe liên hệ admin để xử lý thủ công. Ngoài phạm vi tự động.

## 8. Chat

- Mỗi cặp (người thuê, xe) có **một cuộc trò chuyện**, được tạo khi người thuê bấm "Nhắn chủ xe" hoặc khi tạo đơn.
- Nhắn **thời gian thực** (WebSocket), có trạng thái đã đọc, gửi được ảnh.
- **Trước khi đơn được xác nhận**, hệ thống tự che số điện thoại và link trong tin nhắn để hai bên không giao dịch ngoài nền tảng.
- Tin nhắn hệ thống (ví dụ "Đơn đã được xác nhận") được chèn vào cuộc trò chuyện.

## 9. Đánh giá hai chiều

- Sau khi đơn **HOÀN_TẤT**, mỗi bên có **14 ngày** để đánh giá: 1–5 sao kèm nhận xét.
- Đánh giá của hai bên được **công khai cùng lúc**: khi cả hai đã viết, hoặc khi hết 14 ngày, để tránh đánh giá trả đũa.
- Người thuê đánh giá **xe và chủ xe**. Chủ xe đánh giá **người thuê**.

## 10. Email thông báo

Gửi khi: xác thực tài khoản, quên mật khẩu, GPLX hoặc xe được duyệt/từ chối, có yêu cầu đặt mới (gửi chủ xe), đơn được chấp nhận/từ chối/huỷ, thanh toán thành công, nhắc lịch nhận xe trước 24 giờ, nhắc trả xe trước 2 giờ, nhắc đánh giá, có tin nhắn mới (gộp tin, tối đa 1 email mỗi 30 phút), mở khiếu nại hoặc có kết quả khiếu nại, rút tiền xong.

## 11. Console (Admin)

- **Tổng quan**: số người dùng, số xe, số đơn theo trạng thái, GMV, doanh thu hoa hồng (biểu đồ theo ngày).
- **Duyệt GPLX**: hàng đợi, xem ảnh, duyệt hoặc từ chối kèm lý do.
- **Duyệt xe**: hàng đợi, xem giấy tờ, duyệt hoặc từ chối kèm lý do. Ẩn hoặc gỡ được xe đang hiển thị.
- **Người dùng**: tìm kiếm, xem chi tiết, khoá hoặc mở khoá.
- **Đơn thuê**: tra cứu, xem dòng thời gian, huỷ cưỡng chế.
- **Tranh chấp**: xem bằng chứng hai bên, ra quyết định.
- **Rút tiền**: duyệt yêu cầu, đánh dấu đã chuyển.
- **Cấu hình**: % hoa hồng, chính sách huỷ, danh mục hãng xe/dòng xe/tiện nghi.

## 12. Quy tắc nghiệp vụ và tình huống đặc biệt **[Đề xuất]**

### 12.1 Chung

- Múi giờ: `Asia/Ho_Chi_Minh`. Tiền VND lưu dưới dạng số nguyên.
- Thời gian nhận và trả xe chọn theo **bước 30 phút**.
- Giờ nhận xe phải cách hiện tại **ít nhất 2 giờ**, và không được đặt trước quá **90 ngày**.
- Chủ xe **không thể thuê xe của chính mình**.
- **Giá được chốt vào đơn** lúc đặt. Chủ xe đổi giá sau đó không ảnh hưởng đến đơn đã đặt.
- **Ngày lễ** dùng để tính phụ phí: admin quản lý danh sách trong Console.
- Có **một vai trò admin duy nhất**. Tài khoản admin được tạo bằng seed, không đăng ký từ giao diện.

### 12.2 Giấy phép lái xe

- Người thuê phải đủ **18 tuổi** trở lên. GPLX phải là **hạng B trở lên**, bao gồm hạng B1, B2 theo luật cũ.
- GPLX phải **còn hạn đến hết ngày trả xe**.
- Người có GPLX **hạng B1 cũ (chỉ lái xe số tự động)** chỉ được thuê xe số tự động.
- Xe từ 10 chỗ trở lên cần GPLX **hạng D1 trở lên**.
- Hệ thống gửi email nhắc **30 ngày trước** khi GPLX hết hạn. GPLX đã hết hạn chuyển về trạng thái "chưa xác minh".

### 12.3 Thay đổi thông tin xe

- **Phải được admin duyệt lại**: biển số, giấy tờ xe, hãng/dòng/năm sản xuất. Trong thời gian chờ duyệt, xe vẫn hiển thị bằng thông tin cũ.
- **Không cần duyệt lại**: giá, ảnh, mô tả, tiện nghi, lịch trống.
- Chủ xe có thể **tạm ngưng** xe. Khi đó xe bị ẩn khỏi kết quả tìm kiếm, các đơn đã xác nhận vẫn giữ nguyên.

### 12.4 Trong chuyến

- **Giữ chỗ khi thanh toán**: khi người thuê vào cổng thanh toán, lịch xe được giữ 15 phút. Quá 15 phút chưa thanh toán thì đơn tự huỷ.
- **Trả xe trễ**: được ân hạn 30 phút. Sau đó tính phí trả trễ theo từng giờ, làm tròn lên. Mức phí do chủ xe đặt, mặc định bằng 10% giá ngày mỗi giờ. Phí này trừ vào cọc.
- **Gia hạn chuyến**: người thuê gửi yêu cầu gia hạn khi đang thuê. Lịch phải còn trống và chủ xe chấp nhận. Người thuê thanh toán phần tiền chênh qua VNPay.
- **Chủ xe không giao xe**: người thuê báo trong vòng 2 giờ sau giờ nhận xe. Người thuê được hoàn 100%, chủ xe bị tính một lần huỷ.
- **Người thuê không đến nhận xe**: sau 2 giờ, chủ xe đánh dấu "không đến". Đơn được xử lý như huỷ trước dưới 24 giờ.

### 12.5 Khoá tài khoản

- Đơn **chưa bắt đầu** bị huỷ tự động, người thuê được hoàn 100%.
- Đơn **đang thuê** vẫn tiếp tục đến khi kết thúc.
- Xe của chủ xe bị khoá sẽ bị ẩn khỏi tìm kiếm. Số dư ví được giữ lại để admin xử lý.

## 13. Sơ đồ trang

| Nhóm       | Đường dẫn                                                             | Nội dung                                                                             |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Công khai  | `/`                                                                   | Trang chủ: ô tìm kiếm, xe nổi bật, giới thiệu cách hoạt động                         |
|            | `/tim-xe`                                                             | Kết quả tìm kiếm, bộ lọc, xem danh sách hoặc bản đồ                                  |
|            | `/xe/[id]`                                                            | Chi tiết xe và khung đặt xe                                                          |
|            | `/nguoi-dung/[id]`                                                    | Hồ sơ công khai: xe đang cho thuê, đánh giá                                          |
|            | `/dang-ky`, `/dang-nhap`, `/quen-mat-khau`, `/xac-thuc-email`         | Tài khoản                                                                            |
|            | `/huong-dan`, `/dieu-khoan`, `/chinh-sach-bao-mat`, `/chinh-sach-huy` | Nội dung tĩnh                                                                        |
| Người thuê | `/dat-xe/[carId]`                                                     | Xác nhận đơn, hợp đồng, chuyển sang thanh toán                                       |
|            | `/chuyen-cua-toi`, `/chuyen-cua-toi/[id]`                             | Danh sách chuyến và chi tiết một chuyến: dòng thời gian, biên bản, gia hạn, đánh giá |
| Chủ xe     | `/xe-cua-toi`, `/xe-cua-toi/moi`                                      | Danh sách xe, thêm xe mới (nhập theo từng bước)                                      |
|            | `/xe-cua-toi/[id]`                                                    | Sửa thông tin xe, giá, lịch, giao nhận, cọc                                          |
|            | `/don-cho-thue`, `/don-cho-thue/[id]`                                 | Đơn nhận được: duyệt, biên bản, khiếu nại, đánh giá                                  |
|            | `/vi`                                                                 | Số dư, lịch sử giao dịch, tài khoản ngân hàng, rút tiền                              |
| Chung      | `/tin-nhan`, `/tin-nhan/[id]`                                         | Chat                                                                                 |
|            | `/tai-khoan`                                                          | Hồ sơ, GPLX, đổi mật khẩu                                                            |
| Console    | `/console`                                                            | Tổng quan                                                                            |
|            | `/console/gplx`, `/console/xe`                                        | Hàng đợi duyệt                                                                       |
|            | `/console/nguoi-dung`, `/console/don`                                 | Tra cứu, quản lý người dùng và đơn                                                   |
|            | `/console/tranh-chap`, `/console/rut-tien`                            | Xử lý tranh chấp, duyệt rút tiền                                                     |
|            | `/console/cau-hinh`                                                   | Hoa hồng, ngày lễ, danh mục hãng/dòng xe/tiện nghi                                   |

## 14. Kiến trúc kỹ thuật

| Thành phần           | Lựa chọn                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Monorepo             | pnpm workspaces + Turborepo                                                                  |
| Frontend             | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query                    |
| Backend              | NestJS, TypeScript, REST + WebSocket (Socket.IO) cho chat                                    |
| CSDL                 | PostgreSQL + Prisma ORM. Tìm theo vị trí bằng vĩ độ/kinh độ và Haversine, không dùng PostGIS |
| Hàng đợi / cache     | Valkey (tương thích Redis) + BullMQ (gửi email, job hết hạn đơn, giải phóng cọc)             |
| Lưu file             | S3-compatible: RustFS khi chạy local, Cloudflare R2 khi deploy. Bucket public và private     |
| Email                | Nodemailer. Local dùng Mailpit, khi deploy dùng Resend                                       |
| Thanh toán           | VNPay sandbox                                                                                |
| Bản đồ               | Leaflet + OpenStreetMap. Gợi ý địa chỉ bằng Nominatim                                        |
| Xác thực             | Email + mật khẩu, JWT (access + refresh token qua httpOnly cookie)                           |
| Kiểm thử             | Vitest (API và `packages/shared`), Playwright (E2E cho các luồng chính)                      |
| Môi trường           | Docker Compose cho local (Postgres, Valkey, RustFS, Mailpit)                                 |
| Deploy **[Đề xuất]** | Web lên Vercel. API, Postgres, Valkey lên Railway hoặc Render                                |

### Tải ảnh lên **[Đề xuất]**

- Chỉ nhận ảnh **JPG, PNG, WebP**, tối đa **10 MB** mỗi tệp. Trình duyệt tải thẳng lên kho lưu trữ qua link có hạn 10 phút. API kiểm tra lại định dạng thật của tệp trước khi nhận, không tin loại tệp trình duyệt khai báo.
- **Ảnh xe** và **ảnh đại diện** là công khai. Hệ thống xoá metadata (gồm vị trí GPS) và lưu dạng WebP. Ảnh xe có hai cỡ: lớn (cạnh dài tối đa 1600px) và nhỏ (tối đa 640px), giữ nguyên tỉ lệ. Ảnh đại diện được cắt vuông 256px.
- **GPLX, giấy tờ xe, ảnh biên bản giao nhận, bằng chứng khiếu nại** là riêng tư và được giữ nguyên tệp gốc, kể cả thời điểm chụp trong EXIF, để làm bằng chứng. Chỉ người có quyền mới xem được, qua link có hạn 5 phút.
- **Ảnh gửi trong chat** là riêng tư và được xoá metadata để không lộ vị trí người gửi.
- Ảnh đã tải lên nhưng không được dùng (ví dụ người dùng bỏ dở form) tự xoá sau 1 ngày.

## 15. Mô hình dữ liệu (rút gọn)

```
User ─┬─ DriverLicense (1-1, trạng thái duyệt)
      ├─ Wallet (chỉ chủ xe) ── WalletTransaction (ledger)
      ├─ BankAccount
      ├─ WithdrawalRequest
      └─ Car ─┬─ CarPhoto
              ├─ CarDocument (private)
              ├─ CarAmenity (n-n với Amenity)
              ├─ CarPricing (giờ/ngày/tháng, phụ phí, giảm giá)
              ├─ AvailabilityBlock
              └─ Booking ─┬─ Payment (VNPay) ── Refund
                          ├─ BookingExtension (gia hạn)
                          ├─ TripReport (nhận/trả xe + ảnh)
                          ├─ Dispute ── DisputeEvidence
                          └─ Review (x2)
Conversation ── Message
CarMake ── CarModel ; Amenity ; Holiday ; PlatformSetting ; Notification(email log)
```

Schema đầy đủ: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Ngoài sơ đồ trên còn có `BookingStatusLog` (dòng thời gian trạng thái của đơn, dùng cho Console) và `TripReportPhoto`.

Ghi chú **[Đề xuất]**:

- **Địa chỉ xe** lưu theo tỉnh/thành và phường/xã. Từ 1/7/2025 Việt Nam bỏ cấp quận/huyện, nên các chỗ ghi "quận" trong spec hiểu là phường/xã.
- **Phụ phí cuối tuần** và **phụ phí ngày lễ** là hai mức % riêng, chủ xe có thể đặt bằng nhau.
- Người thuê viết **một đánh giá** (1–5 sao) dùng chung cho xe và chủ xe. Chủ xe viết một đánh giá cho người thuê.
- **Ngày lễ trong seed** là mọi ngày trong kỳ nghỉ lễ chính thức của khối nhà nước, kể cả cuối tuần nằm trong kỳ nghỉ. Seed gồm năm 2026 và Tết Dương lịch, Tết Nguyên đán 2027 để phủ khung đặt trước 90 ngày. Admin chỉnh trong Console.

## 16. Lộ trình xây dựng

| Giai đoạn                   | Nội dung                                                                                                      | Kết quả demo được                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **0. Khung**                | Monorepo, Docker Compose, Prisma schema, CI lint/test, layout giao diện                                       | Chạy được local                     |
| **1. Tài khoản và xe**      | Đăng ký/đăng nhập, xác thực email, hồ sơ, upload GPLX, đăng xe (đầy đủ mục 4.1–4.2), Console duyệt GPLX và xe | Chủ xe đăng xe, admin duyệt         |
| **2. Tìm kiếm**             | Trang chủ, tìm kiếm + bộ lọc + bản đồ, trang chi tiết xe, lịch trống                                          | Người thuê tìm và xem xe            |
| **3. Đặt xe và thanh toán** | Tính giá, luồng đặt (đặt nhanh/duyệt tay), VNPay sandbox, ví, ledger, huỷ đơn, email                          | Đặt và trả tiền trọn vẹn một chuyến |
| **4. Trong chuyến**         | Chat realtime, biên bản nhận/trả xe, hoàn tất đơn, chia tiền                                                  | Đi hết vòng đời của một chuyến      |
| **5. Sau chuyến**           | Đánh giá hai chiều, khiếu nại/tranh chấp, rút tiền, tổng quan và cấu hình trong Console                       | Đủ tính năng                        |
| **6. Hoàn thiện**           | Dữ liệu mẫu (seed), E2E test, tối ưu mobile, SEO, deploy, README cho portfolio                                | Link demo công khai                 |
