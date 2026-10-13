---
title: Kiến trúc Tổng quan (Architecture)
description: Thiết kế kiến trúc tổng thể của Pebblebase Studio, backend Go và frontend React desktop.
---

Pebblebase Studio được thiết kế theo cấu trúc module linh hoạt hỗ trợ cả chế độ desktop và web server.

---

## Ngăn xếp Công nghệ (Tech Stack)

```
┌────────────────────────────────────────────────────────┐
│               Frontend: React 19 + Vite                │
│       Tailwind CSS v4 + CodeMirror 6 + @xyflow/react    │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP / Wails IPC
┌───────────────────────────▼────────────────────────────┐
│                    Go Core Backend                     │
│  - Engine Drivers (pgx, go-sql-driver, modernc/sqlite) │
│  - Schema Introspector & DDL Diff Engine               │
│  - Local HTTP Loopback Listener & Auto-Update Service  │
└────────────────────────────────────────────────────────┘
```

---

## Các Nguyên tắc Thiết kế Cốt lõi

1. **Phân phối Gọn nhẹ (Lightweight Distribution)**: Wails tận dụng trực tiếp webview native có sẵn của hệ điều hành (WebKit trên macOS, WebView2 trên Windows, WebKitGTK trên Linux). Nhờ đó, kích thước file tải về cực nhỏ (~12MB) so với các ứng dụng cồng kềnh hơn 150MB viết bằng Electron.
2. **Cam kết Bảo mật Cục bộ (Local Security Guarantee)**: Mọi thông tin đăng nhập và kết nối đều được mã hóa cục bộ bằng chuẩn AES-GCM và chỉ lưu trong thư mục người dùng của bạn.
3. **Tương thích Loopback API**: Một HTTP listener cục bộ cho phép cùng một engine Go phục vụ đồng thời cho cả ứng dụng desktop và chế độ web portal tự lưu trữ qua Docker.
