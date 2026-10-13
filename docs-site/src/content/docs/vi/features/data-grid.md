---
title: Bảng Dữ liệu & Trình duyệt Bảng
description: Trình xem bảng dữ liệu ảo hóa hiệu năng cao với chỉnh sửa trực tiếp, bộ lọc và xuất file.
---

Bảng dữ liệu (Data Grid) trong Pebblebase Studio được thiết kế tối ưu cho các tập dữ liệu lớn, sử dụng kỹ thuật ảo hóa DOM để cuộn mượt mà qua hàng triệu bản ghi mà không gây giật lag trình duyệt.

---

## Tính năng Chính

- **Cuộn ảo hóa (Virtualized Scrolling)**: Chỉ những hàng đang hiển thị trong khung nhìn mới được render trong DOM, duy trì tốc độ khung hình 60fps mượt mà.
- **Chỉnh sửa trực tiếp (Inline Editing)**: Nhấp đúp vào bất kỳ ô nào để chỉnh sửa giá trị. Thay đổi được xác thực theo kiểu dữ liệu của cột trước khi thực thi lệnh SQL `UPDATE`.
- **Bộ lọc & Tìm kiếm Cột**: Nhấp vào biểu tượng tìm kiếm ở đầu cột hoặc nhấn `Ctrl+F` để lọc theo chuỗi con, so khớp chính xác hoặc khoảng giá trị.
- **Sắp xếp Đa chiều**: Nhấp vào tiêu đề cột để chuyển đổi giữa sắp xếp tăng dần, giảm dần hoặc thứ tự mặc định.
- **Xuất Dữ liệu**: Xuất bảng hiện tại trực tiếp sang định dạng **CSV** hoặc **JSON** chỉ với 1 nhấp chuột hoặc qua `Ctrl+K`.
- **Điều hướng Khóa ngoại (Foreign Key)**: Nhấp vào huy hiệu khóa ngoại để chuyển nhanh tới bản ghi liên kết ở bảng tương ứng.
