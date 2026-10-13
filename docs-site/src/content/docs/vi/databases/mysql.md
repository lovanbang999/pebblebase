---
title: MySQL & MariaDB
description: Kết nối tới các máy chủ cơ sở dữ liệu MySQL 5.7+, 8.0+ và MariaDB.
---

Kết nối dễ dàng tới các máy chủ MySQL và MariaDB cục bộ hoặc từ xa.

---

## Cấu hình Kết nối

- **Host**: Địa chỉ IP hoặc hostname (ví dụ: `127.0.0.1`).
- **Port**: Cổng kết nối mặc định là `3306`.
- **Database**: Tên cơ sở dữ liệu.
- **Username / Password**: Thông tin tài khoản người dùng MySQL.

---

## Định dạng Chuỗi Kết nối URL (Connection String)

```text
mysql://user:password@tcp(localhost:3306)/my_database?parseTime=true
```
