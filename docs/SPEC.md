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

**GPLX**:

- Người dùng nộp ảnh hai mặt cùng họ tên, số GPLX, hạng, ngày sinh và ngày hết hạn. Ảnh nằm trong bucket private, chỉ người nộp và admin xem được. Admin duyệt hoặc từ chối kèm lý do; kết quả được gửi email.
- **Nộp lại** lúc nào cũng được. GPLX đã duyệt vẫn dùng để thuê xe cho tới khi bản mới được duyệt; bản mới bị từ chối thì bản cũ vẫn giữ. Bản mới được duyệt thì thay bản cũ.
- Mục **GPLX** ở `/tai-khoan` hiện trạng thái: chưa nộp, chờ duyệt, đã duyệt, **sắp hết hạn** (trong 30 ngày cuối, cùng lúc gửi email nhắc), bị từ chối kèm lý do, đã hết hạn. Bản mới đang chờ hoặc bị từ chối hiện cùng GPLX đang dùng. Chưa xác thực email thì chưa hiện form nộp mà hiện nút gửi lại email xác thực.
- **Mỗi số GPLX chỉ gắn với một tài khoản**: số đang chờ duyệt hoặc đã duyệt ở tài khoản khác thì không nộp được, người dùng được hướng dẫn liên hệ hỗ trợ.
- **[Đề xuất]** Số GPLX gồm 12 chữ số. Người nộp phải đủ 18 tuổi; GPLX nộp lên phải còn hạn. Admin không duyệt được GPLX đã hết hạn.
- **[Đề xuất]** Hạng được chấp nhận: mọi hạng lái được ô tô theo luật mới (B, C1, C, D1, D2, D và các hạng kéo rơ moóc BE, C1E, CE, D1E, D2E, DE) và theo luật cũ (B1, B2, C, D, E, FB2, FC, FD, FE). "Hạng D1 trở lên" cho xe từ 10 chỗ là D1, D2, D, D1E, D2E, DE và D, E, FD, FE cũ.

### Tài khoản và đăng nhập

- **Chưa xác thực email**: vẫn đăng nhập, xem và tìm xe, sửa hồ sơ được. Bị chặn khi **đặt xe, đăng xe, nộp GPLX, nhắn tin, rút tiền**. Có nút gửi lại email xác thực.
- **Sau khi đăng ký** (chốt 2026-11-14): người dùng được đăng nhập luôn và quay lại trang đang xem trước đó (không có thì về trang chủ). Một **banner nhắc xác thực email** có nút gửi lại hiện ở đầu trang; người dùng tắt được banner cho tới hết phiên trình duyệt. Thao tác bị chặn vì chưa xác thực luôn báo lý do kèm nút gửi lại email.
- **Trang cần đăng nhập** (chuyến của tôi, xe của tôi, đơn cho thuê, ví, tin nhắn, tài khoản, đặt xe): khách chưa đăng nhập được chuyển tới trang đăng nhập, đăng nhập xong thì quay lại đúng trang đó. Đã đăng nhập mà mở trang đăng nhập hoặc đăng ký thì được chuyển đi luôn.
- **Phiên đăng nhập**: không dùng 30 ngày thì phải đăng nhập lại. Mỗi thiết bị là một phiên riêng.
- **Link trong email**: link xác thực email có hiệu lực **24 giờ**, link đặt lại mật khẩu **30 phút**. Mỗi link chỉ dùng một lần; gửi link mới thì link cũ mất hiệu lực. Đặt lại mật khẩu bằng link cũng tính là đã xác thực email.
- **Mật khẩu**: không có quy tắc độ mạnh, chỉ cần không để trống. **[Đề xuất]** Tối đa 128 ký tự (giới hạn kỹ thuật).
- **[Đề xuất]** Email không phân biệt chữ hoa, chữ thường.
- **[Đề xuất]** Màn hình quên mật khẩu luôn trả cùng một thông báo, không cho biết email đã có tài khoản hay chưa.
- **[Đề xuất]** Đặt lại hoặc đổi mật khẩu thì các thiết bị khác bị đăng xuất. Tài khoản bị khoá thì mất phiên đăng nhập ngay.
- **[Đề xuất]** Đăng nhập sai **5 lần trong 15 phút** (theo email và địa chỉ IP) thì phải chờ hết 15 phút. Email xác thực và email đặt lại mật khẩu gửi tối đa **3 lần mỗi giờ** cho mỗi email, mỗi lần cách nhau ít nhất **60 giây**.

### Hồ sơ

- **Hồ sơ riêng** (`/tai-khoan`): họ tên, số điện thoại, ảnh đại diện. Email không đổi được ở đây. **Ngày sinh lấy từ GPLX** đã nộp, hồ sơ không có ô ngày sinh riêng.
- **Số điện thoại**: tuỳ chọn, không xác minh, không bắt buộc duy nhất. Chỉ nhận số di động Việt Nam, tự chuẩn hoá về dạng `0912345678`. Số điện thoại chỉ hiện cho bên kia sau khi đơn được xác nhận.
- **Hồ sơ công khai** (`/nguoi-dung/[id]`): họ tên, ảnh đại diện, ngày tham gia, số chuyến, điểm đánh giá, tỉ lệ phản hồi. Không bao giờ có email, số điện thoại, ngày sinh.
- **Tỉ lệ phản hồi**: % yêu cầu đặt xe (chế độ duyệt tay) mà chủ xe chấp nhận hoặc từ chối trước khi hết hạn 6 giờ, tính trên các yêu cầu tạo trong 90 ngày gần nhất. Yêu cầu còn chờ hoặc bị người thuê huỷ trước khi chủ xe trả lời thì không tính. Chưa có yêu cầu nào thì không hiển thị.
- **[Đề xuất]** **Số chuyến** là số đơn đã hoàn tất, cộng cả khi thuê và khi cho thuê. **Điểm đánh giá** là trung bình các đánh giá đã công bố mà người đó nhận được, cả với vai trò chủ xe và người thuê, làm tròn một chữ số thập phân.
- **[Đề xuất]** Tài khoản bị khoá và tài khoản admin không có hồ sơ công khai.

## 4. Đăng xe (chủ xe)

### 4.1 Thông tin xe

- **Cơ bản**: hãng, dòng xe, năm sản xuất, biển số (công khai sẽ che một phần, ví dụ `51K-***.45`), màu, kiểu thân xe (Sedan, SUV, Crossover, MPV, Hatchback, Bán tải), số chỗ, hộp số (số sàn, tự động), nhiên liệu (xăng, dầu, điện, hybrid), mức tiêu hao (L/100km hoặc kWh/100km), ODO.
- **Ảnh**: ít nhất 4 ảnh, tối đa 15 ảnh, chọn một ảnh làm ảnh bìa.
- **Tiện nghi** (chọn nhiều): bản đồ/định vị GPS, Bluetooth, Apple CarPlay/Android Auto, camera lùi, camera 360, cảm biến va chạm, cảnh báo điểm mù, cửa sổ trời, ghế da, cửa hít, cruise control, cốp điện, cảm biến áp suất lốp, ghế trẻ em, khe cắm USB/sạc, ETC (thu phí không dừng), lốp dự phòng, túi khí.
- **Mô tả** tự do.
- **Quy định xe** (bật/tắt từng mục, có thể ghi chú thêm): không hút thuốc, không chở thú cưng, không chở sầu riêng/hải sản, trả xe với mức nhiên liệu như lúc nhận, giữ vệ sinh xe.
- **Giới hạn km** (tuỳ chọn): số km/ngày và phụ phí cho mỗi km vượt.
- **Lưu nháp và gửi duyệt**: lần lưu đầu tiên cần đủ thông tin cơ bản và địa chỉ xe. Ảnh, giấy tờ và tiện nghi có thể bổ sung ở các bước sau. Muốn gửi duyệt thì xe phải có 4–15 ảnh, bảng giá, giấy đăng ký và giấy đăng kiểm còn hạn (ngày hết hạn từ hôm nay trở đi). Xe bị từ chối thì chủ xe sửa rồi gửi duyệt lại.
- **Năm sản xuất**: không giới hạn tuổi xe. Hệ thống chỉ nhận năm từ 1990 đến năm sau để chặn lỗi nhập.
- **Xoá xe**: chỉ xoá được xe chưa từng được duyệt (nháp hoặc bị từ chối). Xe đã từng hiển thị chỉ tạm ngưng được, để giữ lịch sử đơn và đánh giá.
- **[Đề xuất]** Biển số theo dạng `51K-123.45` (hoặc `51K-1234` với biển cũ 4 số); hệ thống tự chuẩn hoá khi nhập. Mỗi biển số chỉ thuộc một xe, kể cả biển số đang nằm trong bản sửa chờ duyệt. Không nhận biển ngoại giao.
- **[Đề xuất]** Số chỗ từ 2 đến 16. Toạ độ xe phải nằm trong lãnh thổ Việt Nam.

### 4.2 Giá. Chủ xe cấu hình linh hoạt

- Chủ xe **bật/tắt** từng đơn vị giá và điền giá cho đơn vị đã bật: **theo giờ**, **theo ngày**, **theo tháng**. Phải bật ít nhất một đơn vị.
- Thời gian thuê tối thiểu và tối đa (ví dụ tối thiểu 4 giờ, tối đa 30 ngày).
- **Phụ phí cuối tuần và ngày lễ** (%, tuỳ chọn).
- **Giảm giá thuê dài** (tuỳ chọn): % giảm khi thuê từ 7 ngày trở lên.
- **Cách hệ thống tính tiền**: chia thời gian thuê thành tháng, ngày và giờ, tính theo các đơn vị đã bật, rồi chọn tổng **rẻ nhất cho người thuê**. Ví dụ: số giờ lẻ đã đắt hơn giá một ngày thì tính tròn một ngày. Hai cách bằng tiền nhau thì dùng đơn vị lớn hơn.
  - **Nửa giờ lẻ** tính nửa giá giờ: 4 giờ 30 phút = 4,5 × giá giờ. Không bật giá giờ thì phần lẻ được làm tròn lên một ngày (hoặc một tháng).
  - **Phụ phí cuối tuần và ngày lễ tính theo tỷ lệ giờ**: tiền thuê được chia đều cho từng nửa giờ của chuyến; nửa giờ nào rơi vào thứ Bảy, Chủ nhật hoặc ngày lễ (theo giờ Việt Nam) thì cộng phụ phí cho phần đó. Ví dụ: nhận 14:00 thứ Sáu, trả 14:00 Chủ nhật, có 38/48 giờ là cuối tuần. Ngày lễ trùng cuối tuần thì lấy mức cao hơn, không cộng dồn.
  - **[Đề xuất]** Giảm giá thuê dài áp dụng khi chuyến dài từ đủ 7 ngày (168 giờ), tính trên tiền thuê sau phụ phí, kể cả phần tính theo tháng.
  - **[Đề xuất]** Phụ phí và giảm giá được làm tròn đến 1.000đ gần nhất. Tiền thuê = giá theo đơn vị + phụ phí − giảm giá. Tổng thanh toán = tiền thuê + phí giao xe + tiền cọc.
- Thời gian thuê tối thiểu **không ngắn hơn đơn vị nhỏ nhất đang bật**: không bật giá giờ thì tối thiểu 24 giờ; chỉ bật giá tháng thì tối thiểu 30 ngày. Nhờ vậy người thuê không bị tính tròn lên cả ngày hoặc cả tháng cho chuyến ngắn.
- **[Đề xuất]** Một tháng thuê tính là 30 ngày. Thời gian thuê tối đa không quá 180 ngày.
- **[Đề xuất]** Mọi số tiền chủ xe nhập đều tròn nghìn đồng. Giới hạn để chặn lỗi nhập: giá giờ 10.000đ–5.000.000đ, giá ngày 100.000đ–50.000.000đ, giá tháng 1.000.000đ–1.000.000.000đ. Phụ phí cuối tuần và ngày lễ từ 1% đến 100%, giảm giá thuê dài từ 1% đến 50%.

### 4.3 Lịch trống **[Đề xuất]**

- Mặc định xe **luôn trống**.
- Chủ xe có thể **chặn** khoảng ngày giờ (xe bận, đi bảo dưỡng) trên lịch.
- Hệ thống tự chặn những khoảng đã có đơn xác nhận. Thêm **thời gian đệm** giữa hai chuyến do chủ xe chọn (mặc định 2 giờ, từ 0 đến 24 giờ theo bước 30 phút) để vệ sinh xe.
- Đơn **chiếm lịch** khi ở trạng thái CHỜ_THANH_TOÁN, ĐÃ_XÁC_NHẬN hoặc ĐANG_THUÊ, tính từ giờ nhận xe đến giờ trả xe cộng thời gian đệm. Đơn **CHỜ_DUYỆT không chiếm lịch**: nhiều người có thể gửi yêu cầu trùng giờ, chủ xe chấp nhận đơn nào trước thì đơn đó giữ lịch, các yêu cầu trùng còn lại không chấp nhận được nữa. Thời gian đệm được chốt vào đơn lúc đặt.
- **Chặn tay**: từ chối tạo hoặc sửa khoảng chặn trùng đơn đang chiếm lịch, kể cả thời gian đệm đã chốt của đơn. Các khoảng chặn tay được phép trùng nhau và sửa/xoá độc lập. Thời gian theo bước 30 phút, kết thúc sau bắt đầu; khoảng chặn là nửa mở `[bắt đầu, kết thúc)`, không cộng đệm. Đệm chỉ áp dụng giữa hai chuyến.
- **Lịch bận công khai theo tháng**: khách chưa đăng nhập xem được lịch của xe đang hiển thị (cùng điều kiện với tìm kiếm). Tháng tính theo giờ Việt Nam. Chỉ trả các khoảng bận đã gộp (cả khoảng tiếp giáp), cắt tại biên tháng; không trả lý do chặn, mã đơn hoặc thông tin cá nhân. Lịch gồm chặn tay và ba trạng thái đơn chiếm lịch với đệm đã chốt; các trạng thái khác không chiếm lịch. Tìm kiếm và tạo đơn vẫn kiểm tra cả đệm của chuyến mới khi chuyến mới nằm trước một đơn khác.
- **Lịch của chủ xe**: xem được cả xe chưa công khai; danh sách chặn tay theo tháng giữ nguyên đầu/cuối khoảng và lý do để sửa/xoá. Xe đã bị admin gỡ không được sửa lịch, theo quy tắc sửa xe chung.
- **[Đề xuất]** Không áp dụng giới hạn đặt trước hoặc độ dài chuyến cho chặn tay; chủ xe có thể quản lý cả khoảng quá khứ và tương lai. Lý do chặn tuỳ chọn, tối đa 500 ký tự.

### 4.4 Giao nhận xe **[Đề xuất]**

- **Nhận tại chỗ**: luôn có. Địa chỉ trên trang công khai chỉ hiển thị **gần đúng** (phường/quận, vòng tròn trên bản đồ). Địa chỉ chính xác hiện ra sau khi đơn được xác nhận.
- **Giao tận nơi** (tuỳ chọn): chủ xe đặt bán kính tối đa (km) và phí giao (đ/km, hoặc miễn phí trong X km).
- **Phí giao xe** = (khoảng cách − số km miễn phí) × phí mỗi km, không âm. Ví dụ: miễn phí 5 km, 10.000đ/km, giao 8 km → 30.000đ. Số km miễn phí không lớn hơn bán kính giao.
- **Khoảng cách giao xe** là đường chim bay từ **điểm gần đúng cố định đang hiển thị công khai** của xe đến địa chỉ giao, làm tròn lên km nguyên. Cùng điểm này được dùng để tính phí và kiểm tra bán kính giao ở cả báo giá lẫn tạo đơn; không tính từ vị trí thật để tránh dò địa chỉ xe qua việc thử nhiều điểm giao. Địa chỉ xa hơn bán kính giao thì không đặt giao xe được. (Chốt 2026-11-14.)
- **[Đề xuất]** Bán kính giao tối đa 50 km, phí giao từ 0 đến 100.000đ mỗi km.

### 4.5 Chế độ duyệt đơn

Chủ xe chọn cho từng xe:

- **Đặt nhanh**: người thuê thanh toán xong là đơn được xác nhận ngay.
- **Duyệt tay**: chủ xe có **6 giờ** để chấp nhận hoặc từ chối. Hết hạn mà chưa trả lời thì đơn tự huỷ.
  - Hạn duyệt là mốc sớm hơn giữa 6 giờ sau khi đặt và **30 phút trước giờ nhận xe**, để còn thời gian thanh toán. (Chốt 2026-11-14.)

### 4.6 Tiền cọc **[Đề xuất]**

- Chủ xe đặt mức cọc, mặc định 5.000.000đ, cho phép từ 0 đến 50.000.000đ (tròn nghìn đồng).
- Người thuê thanh toán **tiền thuê + phí giao xe + cọc** cùng một lần qua web. Carenta giữ toàn bộ số tiền này.
- Cọc được hoàn **72 giờ sau khi trả xe** nếu không có khiếu nại (xem mục 7).

## 5. Tìm và thuê xe (người thuê)

### 5.1 Tìm kiếm

- **Ô tìm kiếm chính**: địa điểm (tỉnh/thành, quận) cùng thời gian nhận và trả xe.
- **Bộ lọc**: khoảng giá, hãng, kiểu thân xe, số chỗ, hộp số, nhiên liệu, đặt nhanh, giao tận nơi, tiện nghi.
- **Sắp xếp**: giá, đánh giá, khoảng cách, mới nhất.
- **Hai chế độ xem**: danh sách và **bản đồ** (OpenStreetMap + Leaflet, miễn phí).
- Chỉ hiện những xe **trống trong khoảng thời gian đã chọn**.
- **Xe được hiện**: đã duyệt, không tạm ngưng, không bị ẩn hoặc gỡ, không đang bị ẩn do chủ xe huỷ nhiều, và chủ xe không bị khoá.
- **Thời gian nhận và trả xe là tuỳ chọn.** Chưa chọn thì không lọc lịch trống và không có giá ước tính. Đã chọn thì kiểm tra như lúc đặt xe (bước 30 phút, giờ nhận cách hiện tại ít nhất 2 giờ và không quá 90 ngày), chỉ hiện xe trống cả chuyến (tính cả thời gian đệm, §4.3) và có thời gian thuê tối thiểu/tối đa phù hợp, kèm tiền thuê ước tính của chuyến.
- **Khoảng giá và sắp xếp theo giá** dùng **giá quy đổi 1 ngày**: giá ngày; xe không bật giá ngày thì lấy mức thấp hơn của giá giờ × 24 và giá tháng ÷ 30 (làm tròn đến 1.000đ). Con số này không phụ thuộc thời gian đã chọn.
- **Vị trí gần đúng**: mỗi xe được lệch một khoảng cố định từ 200 m đến 1 km (không đổi giữa các lần tải), bản đồ vẽ vòng tròn bán kính 1 km quanh điểm đó. Lọc theo bán kính và khoảng cách hiển thị cũng tính theo điểm gần đúng, để không dò ra được vị trí thật.
- **Sắp xếp mặc định**: tìm quanh một vị trí thì gần nhất trước, còn lại thì xe mới được duyệt trước. Xếp theo đánh giá thì xe chưa có đánh giá nằm cuối.
- **[Đề xuất]** Tìm quanh một vị trí mặc định bán kính 10 km, tối đa 50 km. Lọc tiện nghi thì xe phải có đủ mọi tiện nghi đã chọn. Mỗi trang tối đa 50 xe.
- **[Đề xuất]** Thời gian đệm chỉ tính giữa hai chuyến; khoảng chủ xe tự chặn chỉ cần không trùng với giờ nhận–trả xe.

### 5.2 Trang chi tiết xe

Gồm: bộ ảnh, thông số, tiện nghi, quy định, vị trí gần đúng, bảng giá, lịch trống, hồ sơ chủ xe (đánh giá, tỉ lệ phản hồi, số chuyến), đánh giá của xe. Bên cạnh có **khung đặt xe** tính giá trực tiếp.

- **API chi tiết** chỉ trả xe đang hiển thị, cùng điều kiện với tìm kiếm. Luôn che biển số và dùng điểm gần đúng cố định, kể cả khi chủ xe gọi; không trả địa chỉ chính xác, giấy tờ, dữ liệu duyệt hay bản sửa chờ duyệt. Biển 5 số che dạng `51K-***.45`; biển 4 số che dạng `51K-**34`.
- **Đánh giá của xe** chỉ gồm đánh giá người thuê → chủ xe trên đơn của xe đó, đã được công bố. Điểm trung bình và số đánh giá tính trên cùng tập này; số chuyến là số đơn đã hoàn tất của xe. Chi tiết kèm trang đầu đánh giá; API phân trang riêng trả đánh giá mới công bố trước, dùng quy ước phân trang chung (mặc định 20, tối đa 100).
- **Báo giá** không cần đăng nhập, xác thực email hoặc GPLX. Nhận thời gian và hình thức nhận xe; giao xe cần toạ độ điểm giao. Kiểm tra khung giờ như tìm kiếm, thời gian thuê tối thiểu/tối đa, hỗ trợ giao xe/bán kính giao và lịch trống có đệm. Lịch bận thì báo lỗi, không trả báo giá. Tính bằng hàm dùng chung với bảng giá và ngày lễ hiện tại; trả các dòng giá, tiền thuê sau phụ phí/giảm giá, phí giao xe, tiền cọc và tổng tiền.
- **Báo giá không giữ chỗ hoặc chốt giá.** Tạo đơn phải kiểm tra lịch và tính lại giá trong transaction; phí giao xe dùng cùng điểm gần đúng như báo giá. Lịch bận công khai vẫn lấy qua API theo tháng (§4.3).

### 5.3 Luồng đặt xe

```
Chọn thời gian + hình thức nhận xe
      → Xem tổng tiền chi tiết (thuê, phụ phí, giao xe, cọc)
      → Đồng ý điều khoản và hợp đồng thuê (tự sinh từ dữ liệu đơn)
      → [Đặt nhanh]  Thanh toán → ĐÃ XÁC NHẬN
        [Duyệt tay]  Gửi yêu cầu → chủ xe chấp nhận → thanh toán trong 30 phút → ĐÃ XÁC NHẬN
```

- **Đặt nhanh**: tạo đơn ở trạng thái CHỜ_THANH_TOÁN, chiếm lịch ngay, hạn thanh toán 30 phút từ lúc tạo. **Duyệt tay**: tạo CHỜ_DUYỆT và không chiếm lịch; nhiều yêu cầu có thể trùng nhau. Chủ xe chấp nhận đơn nào trước thì đơn đó giữ lịch. Chấp nhận thành công bắt đầu 30 phút chờ thanh toán. Hạn thanh toán luôn không vượt giờ nhận xe.
- **Khi chấp nhận đơn duyệt tay**, kiểm tra lại xe đang hiển thị, tài khoản hai bên còn hoạt động, email người thuê đã xác thực, GPLX còn đủ điều kiện cho xe và toàn chuyến, cùng lịch trống với đệm đã chốt. Không còn hợp lệ thì báo lỗi và giữ CHỜ_DUYỆT đến khi hết hạn; không đổi giá theo bảng giá mới. Riêng sự kiện khoá tài khoản tự huỷ đơn chưa bắt đầu theo §12.5. Mốc cách giờ nhận tối thiểu 2 giờ được kiểm tra lúc tạo yêu cầu, không áp dụng lại khi chủ xe chấp nhận sát giờ. (Chốt 2026-11-14.)
- **Gửi lại yêu cầu đặt xe**: mỗi lần đặt có một `requestId` UUID. Gửi lại cùng mã và nội dung trả về đơn đã tạo, với trạng thái hiện tại, giá/hạn cũ; không tạo thêm đơn hoặc kéo dài giữ chỗ. Cùng mã nhưng nội dung khác thì báo lỗi. Một mã chỉ áp dụng trong phạm vi tài khoản người thuê.
- **Chốt dữ liệu**: API tự tính mọi khoản tiền và phí giao từ điểm gần đúng, ghi bản sao bảng giá, phụ phí, giảm giá, cọc, đệm, quy định, giới hạn km, chế độ duyệt, hoa hồng và địa điểm nhận xe lúc đặt. Đồng ý điều khoản/hợp đồng là bắt buộc; thời điểm đồng ý do server ghi. Số tiền của đơn lưu bằng số nguyên `BigInt` để hỗ trợ đầy đủ mức giá/thời lượng tại §4.2.
- **Quyền xem đơn**: chỉ người thuê và chủ xe của đơn. Trước xác nhận: che biển số, vị trí xe gần đúng, ẩn số điện thoại hai bên; chủ xe chưa thấy địa chỉ giao chính xác, người thuê vẫn thấy địa chỉ mình nhập. Sau xác nhận, hai bên xem địa chỉ nhận xe đã chốt và số liên hệ. Giấy tờ xe và GPLX không nằm trong response đơn.
- **Hết hạn**: tại đúng mốc hạn, đơn chưa thanh toán/chưa duyệt chuyển ĐÃ_HUỶ, giải phóng lịch nếu đang giữ. Job phải đọc trạng thái/hạn mới nhất; job cũ hoặc chạy lại không huỷ đơn đã xác nhận và không ghi trùng lịch sử. Các thao tác đọc đơn/đặt/duyệt cũng xử lý đơn đã quá hạn, để không phụ thuộc hoàn toàn vào độ trễ hàng đợi.

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
  - Hai hàng đợi: **xe mới** (gửi duyệt sớm nhất lên trước) và **thay đổi của xe đã duyệt** (§12.3). Duyệt thay đổi thì áp dụng biển số, hãng/dòng/năm mới và thay giấy tờ cùng loại.
  - Lúc duyệt xe mới, hệ thống kiểm tra lại điều kiện gửi duyệt (ảnh, bảng giá, giấy tờ còn hạn), vì chủ xe vẫn sửa được trong lúc chờ.
  - **Ẩn** là tạm thời: xe ra khỏi tìm kiếm, admin bỏ ẩn được, chủ xe vẫn sửa được nhưng không tự cho thuê lại được. **Gỡ** là vĩnh viễn: không khôi phục, chủ xe không sửa được, thay đổi đang chờ bị bỏ. Chỉ ẩn hoặc gỡ được xe đã duyệt; chuyến đã xác nhận giữ nguyên.
  - Từ chối, ẩn, gỡ đều bắt buộc lý do. Mọi kết quả (duyệt, từ chối, ẩn, bỏ ẩn, gỡ) được gửi email cho chủ xe kèm lý do.
  - **[Đề xuất]** Bỏ ẩn thì xe hiển thị lại (đang cho thuê); chủ xe có thể tạm ngưng lại nếu muốn.
- **Người dùng**: tìm kiếm, xem chi tiết, khoá hoặc mở khoá.
  - Tìm theo tên, email hoặc số điện thoại; lọc theo trạng thái và vai trò.
  - Khoá tài khoản bắt buộc lý do, đăng xuất mọi thiết bị ngay và gửi email kèm lý do; mở khoá cũng gửi email. Không khoá được tài khoản admin. Xử lý đơn thuê khi khoá (§12.5) làm cùng phần đơn thuê.
- **Đơn thuê**: tra cứu, xem dòng thời gian, huỷ cưỡng chế.
- **Tranh chấp**: xem bằng chứng hai bên, ra quyết định.
- **Rút tiền**: duyệt yêu cầu, đánh dấu đã chuyển.
- **Cấu hình**: % hoa hồng, chính sách huỷ, danh mục hãng xe/dòng xe/tiện nghi.
  - Danh mục chỉ thêm, đổi tên, bật/tắt, **không xoá**. Mục đã tắt không hiện khi đăng xe mới; xe đang dùng vẫn giữ nguyên. Mã tiện nghi cố định sau khi tạo.

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

- Người thuê phải đủ **18 tuổi** trở lên. GPLX phải là **hạng B trở lên**, bao gồm hạng B1, B2 theo luật cũ. **[Đề xuất]** Tuổi tính vào ngày nhận xe.
- GPLX phải **còn hạn đến hết ngày trả xe**.
- Người có GPLX **hạng B1 cũ (chỉ lái xe số tự động)** chỉ được thuê xe số tự động.
- Xe từ 10 chỗ trở lên cần GPLX **hạng D1 trở lên**.
- Hệ thống gửi email nhắc **30 ngày trước** khi GPLX hết hạn (lúc 9:00, không gửi nếu đã nộp bản mới đang chờ duyệt). GPLX đã hết hạn chuyển về trạng thái "chưa xác minh" từ 0:00 ngày hôm sau, giờ Việt Nam.

### 12.3 Thay đổi thông tin xe

- **Phải được admin duyệt lại**: biển số, giấy tờ xe, hãng/dòng/năm sản xuất. Trong thời gian chờ duyệt, xe vẫn hiển thị bằng thông tin cũ.
- **Không cần duyệt lại**: giá, ảnh, mô tả, tiện nghi, lịch trống, cấu hình cho thuê (chế độ duyệt đơn, cọc, thời gian đệm, giao xe).
- Chủ xe có thể **tạm ngưng** xe. Khi đó xe bị ẩn khỏi kết quả tìm kiếm, các đơn đã xác nhận vẫn giữ nguyên.
- Mỗi xe có **tối đa một bản thay đổi chờ duyệt**. Chủ xe sửa tiếp thì bản đó được ghi đè; sửa về giá trị cũ thì thay đổi đó bị bỏ. Chủ xe có thể huỷ bản đang chờ. Admin từ chối thì bản sửa bị bỏ, xe giữ thông tin cũ và chủ xe thấy lý do từ chối.
- **[Đề xuất]** Xe đang chờ duyệt lần đầu chưa hiển thị công khai, nên mọi thay đổi áp dụng ngay. Admin duyệt theo thông tin tại thời điểm duyệt.
- **[Đề xuất]** Xe đã duyệt phải giữ ít nhất 4 ảnh: muốn xoá thì thêm ảnh mới trước.
- **[Đề xuất]** Xe đã bị admin gỡ thì chủ xe không sửa được nữa.

### 12.4 Trong chuyến

- **Giữ chỗ khi thanh toán**: lần đầu người thuê bắt đầu thanh toán, hạn có hiệu lực là mốc sớm hơn giữa hạn thanh toán hiện tại và **15 phút từ lần bắt đầu đầu tiên**. Không vượt giờ nhận xe; mở lại không gia hạn. Đúng hạn mà chưa thanh toán thì đơn tự huỷ. (Chốt 2026-11-14.)
- **Trả xe trễ**: được ân hạn 30 phút. Sau đó tính phí trả trễ theo từng giờ, làm tròn lên. Mức phí do chủ xe đặt, mặc định bằng 10% giá ngày mỗi giờ. Xe không bật giá ngày thì chủ xe bắt buộc nhập mức phí này. Phí này trừ vào cọc.
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

### Giao diện chung (chốt 2026-11-14)

- **Màu thương hiệu** xanh dương `#2563EB`, nền trung tính xám xanh. **Font** Be Vietnam Pro. **Chỉ có giao diện sáng**, chưa có dark mode.
- **Logo chữ** "Carenta" kèm biểu tượng chữ C trắng trên nền xanh.
- **Desktop**: header có "Tìm xe", "Cho thuê xe"; chưa đăng nhập thì có "Đăng nhập", "Đăng ký"; đã đăng nhập thì có nút Tin nhắn và menu tài khoản (Chuyến của tôi, Xe của tôi, Đơn cho thuê, Ví Carenta, Tin nhắn, Tài khoản, Console nếu là admin, Đăng xuất). Footer có liên kết tới các trang nội dung tĩnh.
- **Điện thoại**: thanh tab cố định dưới đáy gồm Tìm xe, Chuyến, Tin nhắn, Tài khoản. Tab Tài khoản mở ngăn kéo chứa các mục còn lại của menu tài khoản (chưa đăng nhập thì có "Cho thuê xe", "Đăng nhập", "Đăng ký").
- **Console** có thanh bên (thu vào thành ngăn kéo trên điện thoại), chỉ admin vào được. Người dùng khác vào `/console` thấy trang 404; chưa đăng nhập thì được chuyển tới trang đăng nhập rồi quay lại.

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
| Web gọi API          | Qua `/api/v1` của chính trang web, Next.js chuyển tiếp sang API, nên cookie luôn cùng site   |
| Kiểm thử             | Vitest (API, `packages/shared` và web), Playwright (E2E cho các luồng chính)                 |
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
              ├─ CarRevision (bản sửa chờ duyệt lại, kèm giấy tờ mới)
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
