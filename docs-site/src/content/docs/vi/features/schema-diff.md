---
title: So sánh & Đồng bộ Schema Diff
description: So sánh cấu trúc cơ sở dữ liệu giữa các môi trường development, staging và production.
---

Trong quá trình phát triển, cấu trúc cơ sở dữ liệu giữa các môi trường thường dễ bị lệch nhau (schema drift). Công cụ **Schema Diff** cho phép bạn chọn hai kết nối cơ sở dữ liệu bất kỳ và so sánh trực quan định nghĩa cấu trúc cạnh nhau.

---

## Cách Hoạt động

1. Mở **Schema Diff** từ thanh sidebar hoặc qua Command Palette (`Ctrl+K`).
2. Chọn **Source Connection** (nguồn, ví dụ: `Local Staging`) và **Target Connection** (đích, ví dụ: `Production`).
3. Nhấp nút **"Compare Schemas"**.

---

## Phân tích Khác biệt (Diff Analysis)

Pebblebase tự động phân tích và đối chiếu:
- **Bảng bị thiếu hoặc thừa**: Các bảng chỉ tồn tại ở một môi trường mà môi trường kia chưa có.
- **Lệch cấu trúc cột (Column Drift)**: Cột mới được thêm, cột bị xóa, hoặc không khớp kiểu dữ liệu (ví dụ: `VARCHAR(255)` so với `TEXT`).
- **Sai lệch Chỉ mục & Ràng buộc (Index & Constraint)**: Thiếu khóa chính (primary key), ràng buộc duy nhất (unique constraint), hoặc khóa ngoại (foreign key).

Giao diện sẽ tự động tạo tập lệnh migration DDL chuẩn xác để đồng bộ môi trường đích về đúng cấu trúc chuẩn.
