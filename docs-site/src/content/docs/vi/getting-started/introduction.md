---
title: Giới thiệu Pebblebase
description: Tổng quan về Pebblebase Studio, triết lý thiết kế và các tính năng cốt lõi.
---

**Pebblebase Studio** là ứng dụng quản lý cơ sở dữ liệu độc lập, hiện đại và tốc độ cao dành cho các nhà phát triển phần mềm làm việc với PostgreSQL, MySQL, SQLite và MongoDB.

---

## Vì sao nên chọn Pebblebase Studio?

Nhiều công cụ quản lý cơ sở dữ liệu hiện nay thường rơi vào hai thái cực: quá nặng nề và phức tạp (như DBeaver, DataGrip) hoặc chỉ giới hạn ở một giao diện web cơ bản.

Pebblebase được thiết kế với triết lý tối giản và hiệu quả:

- **Khởi động tức thì**: Được xây dựng bằng Go và Wails v2, ứng dụng mở ngay lập tức mà không có độ trễ lớn của Electron hay Java.
- **Tiêu thụ tài nguyên tối thiểu**: Chiếm ít RAM và CPU, thích hợp để chạy thường trực song song cùng IDE của bạn.
- **Bảo mật cục bộ (Local-First)**: Mọi thông tin đăng nhập và chuỗi kết nối đều được mã hóa bằng AES-256-GCM và lưu trữ cục bộ trên máy tính của bạn. Không gửi dữ liệu qua bất kỳ máy chủ bên thứ ba nào.
- **Giao diện người dùng bóng bẩy**: Thiết kế cửa sổ frameless hiện đại, tự động đồng bộ theo chủ đề Sáng/Tối của hệ điều hành, phím tắt Command Palette (`Ctrl+K`).

---

## Các hệ cơ sở dữ liệu được hỗ trợ

| Hệ quản trị CSDL | Kiểu | Tính năng nổi bật |
| :--- | :--- | :--- |
| **PostgreSQL** | Quan hệ | Kiểm tra Schema, Khóa ngoại Foreign Key, Phân trang, Phân tích JSONB |
| **MySQL / MariaDB** | Quan hệ | Lập chỉ mục Index, Xem cấu trúc DDL, Truy vấn bảng nhanh |
| **SQLite** | Nhúng | Mở file `.db` trực tiếp, hỗ trợ chế độ WAL, chỉnh sửa tại chỗ |
| **MongoDB** | Tài liệu | Trình soạn thảo Document JSON, lọc collection, cập nhật linh hoạt |

---

## Sẵn sàng bắt đầu?

Tiếp tục với [Hướng dẫn Cài đặt](/pebblebase/vi/getting-started/installation/) để tải phiên bản phù hợp với hệ điều hành của bạn.
