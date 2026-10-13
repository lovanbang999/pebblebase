---
title: PostgreSQL
description: Kết nối tới PostgreSQL, quản lý schema, kết nối bảo mật SSL và thực thi truy vấn.
---

Pebblebase Studio hỗ trợ toàn diện các phiên bản PostgreSQL từ 12, 13, 14, 15, 16 đến mới nhất.

---

## Cấu hình Kết nối

- **Host**: Địa chỉ IP hoặc hostname của máy chủ cơ sở dữ liệu (ví dụ: `127.0.0.1` hoặc `db.example.com`).
- **Port**: Cổng kết nối mặc định là `5432`.
- **Database**: Tên cơ sở dữ liệu cần kết nối.
- **Username / Password**: Thông tin tài khoản PostgreSQL của bạn.
- **SSL Mode**: Hỗ trợ các chế độ `disable`, `require`, và `verify-full`.

---

## Định dạng Chuỗi Kết nối URL (Connection String)

Bạn cũng có thể dán trực tiếp chuỗi URL PostgreSQL tiêu chuẩn:
```text
postgres://user:password@localhost:5432/my_database?sslmode=disable
```
