# Carenta

Nền tảng kết nối chủ xe ô tô với người thuê xe tự lái tại Việt Nam. Đặc tả sản phẩm: [`docs/SPEC.md`](docs/SPEC.md).

## Chạy local

Cần cài sẵn: Docker, Node và pnpm theo đúng phiên bản trong `devEngines` của [`package.json`](package.json).

```bash
pnpm install

# Biến môi trường (giá trị mặc định khớp với compose.yaml)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Dịch vụ nền
docker compose up -d

pnpm db:migrate   # tạo bảng và sinh Prisma Client
pnpm db:seed      # hãng/dòng xe, tiện nghi, ngày lễ, cấu hình, tài khoản admin
pnpm dev
```

Tài khoản admin mặc định khi chạy local: `admin@carenta.local` / `Carenta@123`. Đổi bằng `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `apps/api/.env` trước khi seed. Seed chạy lại nhiều lần vẫn an toàn và không đổi mật khẩu của tài khoản đã có.

Sau khi kéo code có thay đổi `schema.prisma`, chạy lại `pnpm db:migrate`. Nếu chỉ cần sinh lại Prisma Client mà không đụng DB thì chạy `pnpm db:generate`.

Sau khi chạy:

| Dịch vụ     | Địa chỉ                                                                                                          | Ghi chú                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Web         | http://localhost:3000                                                                                            |                                         |
| API         | http://localhost:4000/api/v1                                                                                     |                                         |
| PostgreSQL  | `localhost:5432`                                                                                                 | user / mật khẩu / database: `carenta`   |
| Valkey      | `localhost:6379`                                                                                                 | Hàng đợi BullMQ, tương thích Redis      |
| RustFS (S3) | API: http://localhost:9000 <br> Console: [localhost:9001/rustfs/console/](http://localhost:9001/rustfs/console/) | Đăng nhập: `carenta` / `carenta-secret` |
| Mailpit     | SMTP: `localhost:1025` <br> Giao diện: http://localhost:8025                                                     | Mọi email gửi đi ở local đều nằm ở đây  |

Lần đầu chạy, service `rustfs-init` tự tạo hai bucket:

- `carenta-public`: ai cũng đọc được, dùng cho ảnh xe và ảnh đại diện.
- `carenta-private`: chỉ truy cập qua presigned URL, dùng cho GPLX và giấy tờ xe.

Lệnh hữu ích:

```bash
docker compose ps              # trạng thái các dịch vụ
docker compose logs -f rustfs  # xem log một dịch vụ
docker compose down            # dừng, giữ dữ liệu
docker compose down -v         # dừng và xoá toàn bộ dữ liệu local
```

## Kiểm tra code

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm format
```
