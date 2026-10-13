---
title: Hướng dẫn Cài đặt
description: Cách cài đặt và chạy Pebblebase Studio trên macOS, Windows, Linux và Docker.
---

Pebblebase Studio được phát hành dưới dạng các gói thực thi desktop độc lập (self-contained) dành cho tất cả các hệ điều hành phổ biến. Bạn có thể tải phiên bản mới nhất trực tiếp từ [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).

---

## Cài đặt trên macOS

<div class="platform-header">
  <svg class="os-icon os-icon-apple" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.38c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.98.6-2.62 1.35-.57.66-.99 1.73-.86 2.76 1.01.08 2-.57 2.55-1.26z"/>
  </svg>
  <strong>Apple macOS</strong>
  <span class="platform-tag">Universal (Apple Silicon & Intel)</span>
</div>

Pebblebase cung cấp gói **Universal binary** tương thích với cả chip Apple Silicon (M1/M2/M3/M4) và máy Mac Intel:

1. Tải về file **`pebblebase-darwin-universal.app.zip`** từ [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Nhấp đúp vào file `.zip` để giải nén thành **`pebblebase.app`**.
3. Kéo ứng dụng `pebblebase.app` vào thư mục `/Applications`.
4. Mở ứng dụng từ Launchpad hoặc Spotlight (`Cmd + Space`).

:::note[Lần đầu mở ứng dụng trên macOS]
Do Pebblebase là dự án mã nguồn mở và chưa đăng ký chứng chỉ trả phí của Apple Developer, macOS Gatekeeper có thể hiển thị cảnh báo xác minh trong lần đầu mở. Bạn chỉ cần nhấp chuột phải vào `pebblebase.app` trong Finder, chọn **Open**, và bấm xác nhận. Hoặc mở Terminal và chạy lệnh sau:
```bash
xattr -cr /Applications/pebblebase.app
```
:::

---

## Cài đặt trên Windows

<div class="platform-header">
  <svg class="os-icon os-icon-windows" viewBox="0 0 24 24" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.949-1.801"/>
  </svg>
  <strong>Microsoft Windows</strong>
  <span class="platform-tag">x64 Portable</span>
</div>

1. Tải về file **`pebblebase-windows-amd64.zip`** từ [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Nhấp chuột phải vào file `.zip` và chọn **Extract All**.
3. Nhấp đúp vào **`pebblebase.exe`** để khởi chạy ứng dụng ngay lập tức.

:::tip[Phiên bản Portable không cần cài đặt]
Pebblebase Studio trên Windows hoàn toàn là bản portable—không yêu cầu quyền quản trị viên (Admin) hay bộ cài MSI. Bạn có thể chạy trực tiếp từ thư mục Downloads hoặc lưu trong USB để sử dụng ở bất kỳ máy tính nào.
:::

---

## Cài đặt trên Linux

<div class="platform-header">
  <svg class="os-icon os-icon-linux" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.7 17.6c-.1-.2-.2-.4-.2-.6 0-.4-.2-.7-.5-1-.1-.1-.3-.2-.4-.2.6-1.8-.3-3.6-1.3-4.9-.8-1.2-2-2.1-1.9-3.7 0-1.9.2-5.4-3.3-5.1-3.6.2-2.6 3.9-2.7 5.2 0 1.1-.5 2.2-1.3 3.1-.2.2-.4.5-.5.7-1 1.2-1.5 2.8-1.5 4.3-.2.2-.4.4-.5.6-.1.1-.2.2-.2.3-.1.1-.3.2-.5.3-.4.1-.7.3-.9.7-.1.3-.2.7-.1 1.1.1.2.1.4 0 .7-.2.4-.2.9 0 1.4.3.4.8.5 1.5.6.5 0 1.1.2 1.6.4.5.3 1.1.5 1.7.5.3 0 .7-.1 1-.2.3-.2.5-.4.6-.7.4 0 1-.2 1.7-.2.6 0 1.2.2 2 .1 0 .1 0 .2.1.3.2.5.7.9 1.3 1h.2c.8-.1 1.6-.5 2.1-1.1.4-.4.9-.7 1.4-.9.6-.3 1-.5 1.1-1 .1-.7-.1-1.1-.5-1.7z"/>
  </svg>
  <strong>Linux Desktop</strong>
  <span class="platform-tag">x64 Binary</span>
</div>

Pebblebase tương thích với Ubuntu, Debian, Fedora, Arch Linux và hầu hết các bản phân phối Linux phổ biến:

1. Tải về file **`pebblebase-linux-amd64.tar.gz`** từ [GitHub Releases](https://github.com/lovanbang999/pebblebase/releases/latest).
2. Giải nén và khởi chạy file nhị phân:
   ```bash
   tar -xzvf pebblebase-linux-amd64.tar.gz
   ./pebblebase
   ```

### Gói phụ thuộc (Dependencies)
Đảm bảo bản phân phối Linux của bạn đã cài đặt GTK3 và WebKitGTK:
* **Ubuntu/Debian:** `sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0` (hoặc `libwebkit2gtk-4.0-37`)
* **Fedora:** `sudo dnf install gtk3 webkit2gtk4.1`
* **Arch Linux:** `sudo pacman -S gtk3 webkit2gtk-4.1`

---

## Docker (Web Studio Tự Lưu Trữ)

<div class="platform-header">
  <svg class="os-icon os-icon-docker" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.186.185.186zm0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186zm-2.953 0h2.118a.186.186 0 00.186-.186V6.29a.186.186 0 00-.186-.185H8.076a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm-2.954 0h2.119a.186.186 0 00.186-.186V6.29a.186.186 0 00-.186-.185H5.122a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zM23.999 12.02c-.104-.15-.75-.845-2.09-.675-.418.052-.77.207-1.077.447-.367-.534-.962-.89-1.85-.92-1.428-.046-2.482.783-2.923 1.838h-11.8c-.37 0-.69.248-.795.602l-1.99 6.842c-.22.756.34 1.503 1.13 1.503h18.064c1.07 0 2.01-.734 2.274-1.77.728-2.858 1.488-5.836.877-7.867z"/>
  </svg>
  <strong>Docker Container</strong>
  <span class="platform-tag">Multi-Arch Web Portal</span>
</div>

Chạy Pebblebase Studio như một cổng thông tin web nội bộ cho cả nhóm truy cập trực tiếp qua trình duyệt:

```bash
docker run -d \
  --name pebblebase \
  -p 8080:8080 \
  -v pebblebase_data:/data \
  ghcr.io/lovanbang999/pebblebase:latest
```

Mở trình duyệt tại `http://localhost:8080` để truy cập web studio.
