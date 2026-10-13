---
title: Hướng dẫn Khởi đầu nhanh
description: Kết nối tới cơ sở dữ liệu đầu tiên và duyệt dữ liệu trong vòng 2 phút.
---

Hướng dẫn này sẽ giúp bạn thiết lập kết nối tới cơ sở dữ liệu đầu tiên và bắt đầu thao tác với dữ liệu.

---

## Bước 1: Khởi động Pebblebase Studio

Mở ứng dụng Pebblebase trên hệ điều hành của bạn hoặc truy cập phiên bản web tại `http://localhost:8080`.

Bạn sẽ thấy màn hình chào mừng hiển thị danh sách các kết nối đã lưu cùng nút **Add Connection (Thêm kết nối mới)**.

---

## Bước 2: Chọn Hệ quản trị Cơ sở dữ liệu

Nhấp vào **Add Connection** và chọn loại CSDL bạn muốn kết nối:

- **PostgreSQL**: Cung cấp Host, Port (mặc định 5432), Database, Username và Password.
- **MySQL / MariaDB**: Cung cấp Host, Port (mặc định 3306), Database, Username và Password.
- **SQLite**: Chọn hoặc duyệt trực tiếp tới file `.db` hoặc `.sqlite` trên máy.
- **MongoDB**: Nhập chuỗi kết nối chuẩn `mongodb://...` hoặc `mongodb+srv://...`.

---

## Bước 3: Kiểm tra & Lưu Kết nối

1. Nhấp nút **Test Connection** để kiểm tra tính hợp lệ của thông tin kết nối và đường truyền mạng.
2. Khi nhận được thông báo kiểm tra thành công, nhấp **Save Connection**.
3. Kết nối của bạn sẽ được mã hóa an toàn bằng AES-256-GCM và lưu trữ cục bộ.

---

## Bước 4: Khám phá Dữ liệu

Sau khi kết nối thành công:

- Sử dụng **thanh Sidebar** bên trái để xem danh sách bảng (Tables) và view.
- Nhấp vào bất kỳ bảng nào để mở **Data Grid** hiển thị dữ liệu trực quan với phân trang tự động.
- Mở tab **ERD Diagram** để quan sát sơ đồ liên kết thực thể quan hệ giữa các bảng.
- Nhấn `Ctrl + K` (hoặc `Cmd + K` trên macOS) để mở **Command Palette** và tìm kiếm bảng hoặc lệnh nhanh chóng.
