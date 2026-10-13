---
title: Tự lưu trữ với Docker Compose
description: Triển khai Pebblebase Studio dưới dạng ứng dụng web nội bộ với Docker Compose.
---

Pebblebase Studio có thể chạy dưới dạng một cổng thông tin web trong container, cho phép các thành viên trong nhóm truy cập trực tiếp các công cụ quản trị cơ sở dữ liệu qua trình duyệt với hệ thống xác thực tập trung.

---

## Bắt đầu nhanh với Docker Compose

Lưu cấu hình sau thành file `docker-compose.yml`:

```yaml
version: '3.8'

services:
  pebblebase:
    image: ghcr.io/lovanbang999/pebblebase:latest
    container_name: pebblebase-studio
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - pebblebase_data:/data
    environment:
      - PORT=8080
      - DATA_DIR=/data
      - PEBBLEBASE_AUTH_ENABLED=true

volumes:
  pebblebase_data:
```

Khởi chạy container:
```bash
docker compose up -d
```

Truy cập ứng dụng tại `http://localhost:8080`.
