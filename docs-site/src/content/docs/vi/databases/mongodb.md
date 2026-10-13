---
title: MongoDB
description: Duyệt document, chuyển đổi BSON và quản lý collection cho MongoDB.
---

Pebblebase Studio hỗ trợ kết nối tới các máy chủ và cụm MongoDB (bao gồm cả MongoDB Atlas trên đám mây).

---

## Định dạng Kết nối

Cung cấp chuỗi URI MongoDB chuẩn:
```text
mongodb://localhost:27017/my_database
```
Hoặc kết nối cụm MongoDB Atlas:
```text
mongodb+srv://user:password@cluster0.example.mongodb.net/my_database?retryWrites=true&w=majority
```

---

## Trình duyệt Document

- Duyệt các collection linh hoạt kèm phân trang tự động.
- Xem chi tiết từng trường dữ liệu dưới dạng JSON được format gọn gàng.
- Chỉnh sửa và cập nhật trực tiếp document với bước kiểm tra tính hợp lệ trước khi lưu.
