---
title: Sơ đồ ERD Trực quan
description: Tự động vẽ và trực quan hóa cấu trúc cơ sở dữ liệu quan hệ với sơ đồ thực thể tương tác.
---

Nhấn `Alt+E` (hoặc `Option+E` trên macOS) để mở giao diện **Entity Relationship Diagram (ERD)** tương tác trực quan cho kết nối cơ sở dữ liệu hiện tại.

---

## Tính năng Trực quan Tương tác

- **Tự động Bố trí (Automated Layout)**: Ứng dụng sử dụng thuật toán đồ thị DAG (Directed Acyclic Graph) thông qua `@xyflow/react` và `dagre` để sắp xếp gọn gàng các bảng liên kết mà không bị rối đường nối.
- **Truy vết Quan hệ (Relationship Tracing)**: Di chuột hoặc nhấp vào đường nối khóa ngoại để làm nổi bật mối quan hệ giữa bảng cha (parent) và bảng con (child).
- **Điều khiển Khung vẽ Canvas**:
  - Zoom và kéo di chuyển (pan) mượt mà bằng trackpad hoặc con lăn chuột.
  - Bản đồ thu nhỏ (Minimap) giúp điều hướng nhanh trong các CSDL lớn có hơn 50 bảng.
  - Nút "Fit to View" giúp canh giữa và hiển thị toàn bộ sơ đồ ngay lập tức.
- **Tự động tạo câu lệnh JOIN**: Nhấp vào liên kết giữa hai bảng trong sơ đồ ERD để tự động tạo mã lệnh SQL `SELECT ... JOIN` chuẩn xác trong Query Console.
