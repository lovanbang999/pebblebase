---
title: Biến Môi trường (Environment Variables)
description: Bảng tra cứu cấu hình chi tiết cho các biến môi trường trong Pebblebase Studio.
---

Pebblebase Studio có thể được tùy chỉnh linh hoạt thông qua các biến môi trường sau:

---

## Danh sách Biến Cấu hình

| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `8080` | Cổng lắng nghe cho web server. |
| `DATA_DIR` | `./data` | Thư mục lưu cấu hình và cơ sở dữ liệu SQLite nội bộ. |
| `PEBBLEBASE_AUTH_ENABLED` | `true` | Bật hoặc tắt màn hình đăng nhập xác thực người dùng. |
| `SESSION_SECRET` | *(ngẫu nhiên)* | Khóa bí mật dùng để ký token phiên JWT. |
| `APP_ENV` | `production` | Chế độ môi trường (`development` hoặc `production`). |
