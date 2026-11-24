# Đánh số mảnh ghép

Ứng dụng web chạy trên điện thoại: chụp ảnh các mảnh ghép, tự ghi số (bộ Titan 212) và cho biết mảnh đang ngửa hay úp.
Mọi xử lý chạy ngay trong trình duyệt, ảnh không gửi đi đâu.

## Đưa lên GitHub Pages
1. Tạo repository mới trên github.com, chọn Public.
2. Add file → Upload files → kéo toàn bộ file trong thư mục này vào (kể cả `.nojekyll`) → Commit.
3. Settings → Pages → Source: Deploy from a branch → Branch: main, thư mục / (root) → Save.
4. Chờ 1–2 phút, mở `https://<tên-tài-khoản>.github.io/<tên-repo>/` trên điện thoại.
5. Thêm vào màn hình chính: Safari → Chia sẻ → Thêm vào MH chính; Chrome → ⋮ → Cài đặt ứng dụng.

## Cập nhật
Thay file mới vào repo, rồi đổi `VERSION` trong `sw.js` (v1 → v2…) để điện thoại tải bản mới.
