<div align="center">

<img src="media/logo.png" alt="OpenNOW VN Logo" width="140">

# OpenNOW — Bản Build Cộng đồng Việt Nam

**Chơi GeForce NOW mượt mà, đa nền tảng, hoàn toàn miễn phí — đóng gói đặc biệt dành cho cộng đồng cloud gaming Việt Nam**

![Version](https://img.shields.io/badge/version-v0.5.3--vn.1-46D639?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-2783DE?style=for-the-badge&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=for-the-badge)
![Unofficial](https://img.shields.io/badge/kh%C3%B4ng%20ch%C3%ADnh%20th%E1%BB%A9c-fork%20c%E1%BB%99ng%20%C4%91%E1%BB%93ng-D5803B?style=for-the-badge)

[Tải xuống](#-t%E1%BA%A3i-xu%E1%BB%91ng) · [Tính năng](#-t%C3%ADnh-n%C4%83ng) · [What's Changed](#-whats-changed-so-v%E1%BB%9Bi-b%E1%BA%A3n-g%E1%BB%91c) · [Minh bạch & An toàn](#-minh-b%E1%BA%A1ch--an-to%C3%A0n) · [Nguồn gốc & Giấy phép](#-ngu%E1%BB%93n-g%E1%BB%91c--gi%E1%BA%A5y-ph%C3%A9p)

</div>

---

> [!IMPORTANT]
> Đây là **bản build/fork không chính thức**, do cộng đồng Việt Nam đóng gói lại từ mã nguồn mở của **[OpenCloudGaming/OpenNOW](https://github.com/OpenCloudGaming/OpenNOW)**. Dự án này **không thuộc, không được xác nhận hay tài trợ bởi** đội ngũ OpenCloudGaming lẫn NVIDIA. GeForce NOW là thương hiệu của NVIDIA Corporation. Nếu bạn muốn bản chính thức, hãy truy cập thẳng repo gốc ở trên.

<div align="center">
  <img src="media/screenshot-library.jpg" alt="Giao diện thư viện game OpenNOW" width="850">
</div>

## 📖 Giới thiệu

OpenNOW là ứng dụng desktop mã nguồn mở (giấy phép MIT) giúp bạn duyệt thư viện, tinh chỉnh chất lượng stream và chơi GeForce NOW ngay trên máy tính. Bản này là **gói build lại từ mã nguồn gốc**, được đóng gói, kiểm tra và phát hành riêng bởi cộng đồng để thuận tiện hơn cho người dùng Việt Nam (tải nhanh, hướng dẫn tiếng Việt đầy đủ).

> Bạn cần có **tài khoản GeForce NOW riêng** để đăng nhập và sử dụng ứng dụng.

## ✨ Tính năng

| | |
|---|---|
| 🧩 **Đa nền tảng** | Hoạt động trên Windows (build chính thức của bản này); mã nguồn gốc còn hỗ trợ macOS, Android, iOS, Nintendo Switch |
| ⚡ **Streamer hiệu năng gốc** | Lõi streaming Rust, tự động dự phòng WebRTC để đảm bảo ổn định |
| 🌍 **Sẵn tiếng Việt** | Giao diện đã có sẵn ngôn ngữ Tiếng Việt (dịch bởi cộng đồng qua Crowdin) |
| 🛠️ **Tinh chỉnh sâu** | Độ phân giải, codec, độ trễ input, cấu hình controller |
| 🔓 **Miễn phí & mã nguồn mở** | Không quảng cáo, không thu phí, ai cũng có thể tự build lại từ source |

<div align="center">
  <img src="media/screenshot-settings.jpg" alt="Bảng cài đặt OpenNOW" width="850">
</div>

## 📥 Tải xuống

| Nền tảng | File | Ghi chú |
|---|---|---|
| 🪟 Windows (Installer) | `OpenNOW-VN-v0.5.3-vn.1-setup-x64.exe` | Khuyên dùng — tự động cập nhật |
| 💼 Windows (Portable) | `OpenNOW-VN-v0.5.3-vn.1-portable-x64.exe` | Không cần cài đặt, chạy trực tiếp |
| 🍎 macOS / 🤖 Android / 📱 iOS / 🎮 Switch | — | Bản này chưa build; dùng bản chính thức tại [OpenCloudGaming/OpenNOW](https://github.com/OpenCloudGaming/OpenNOW#downloads) |

> ❗ Thay tên file bằng đúng tên file thật trong mục **Releases** của repo bạn trước khi đăng.

## 📝 What's Changed (so với bản gốc v0.5.3)

Đây là danh sách đối chiếu **thực tế** giữa source của bản build này và source gốc tại [OpenCloudGaming/OpenNOW](https://github.com/OpenCloudGaming/OpenNOW) `v0.5.3` — không có mục nào là bịa đặt, ai cũng có thể tự `diff` lại.

### ✨ Tính năng mới
- **Trang Yêu thích (Favorites)** — lưu game yêu thích (lưu cục bộ, đồng bộ real-time), tìm kiếm trong danh sách, xóa tất cả.
- **Bảng chi tiết game (Game Info Panel)** — ảnh hero/cover, mô tả game lấy từ Steam API (ưu tiên tiếng Việt), liên kết nhanh sang Steam/Epic/Xbox/GOG/EA/Ubisoft, số phiên đã chơi + tổng thời gian chơi thực tế, lần chơi gần nhất.
- **Theo dõi thời gian chơi (Playtime Stats)** — đếm số phiên và tổng giờ chơi cho từng game, hiển thị “chơi lần cuối: hôm nay / hôm qua / x ngày trước”.
- **Chọn chế độ hiệu năng lần đầu mở app (Perf Mode)** — tự phát hiện máy cấu hình thấp, gợi ý chế độ Nhẹ/Cao/Tự động.
- **Quick Menu khi đang stream (Ctrl+G)** — bật/tắt mic, xem thống kê, fullscreen, kết thúc phiên — không cần thoát ra giao diện chính.
- **Popup “Phiên đã kết thúc” riêng** — thay cho hộp thoại hệ điều hành mặc định, có đếm ngược tự đóng.
- **Cửa sổ stream riêng (Cloud Client window)** — game chạy trong cửa sổ riêng, tự lấy icon taskbar theo đúng ảnh game đang chơi.
- **Icon ứng dụng riêng** cho bản cài đặt Windows (setup + portable).

### 🐞 Sửa lỗi
- **Discord Rich Presence hiển sai tên game** (ví dụ hiện số ID `103053062` thay vì tên game) — đã thêm bộ nhớ đệm tên game để hiển đúng tên kể cả sau khi khởi động lại app.
- **Nhãn sắp xếp (Sort) luôn hiện tiếng Anh** dù đã đổi ngôn ngữ — đã map sang đúng bản dịch đang chọn.
- **Trang Yêu thích báo sai trạng thái** — trước đây có thể vừa báo “chưa có game yêu thích” vừa báo “X game không còn trong danh mục” cùng lúc do lỗi thời điểm tải catalog — đã tách rõ 2 trạng thái.

### 🔧 Cập nhật giao diện
- Thêm tab **Yêu thích** và nút “đang stream / tiếp tục phiên” ngay trên thanh điều hướng.
- Nút “Dừng phiên” chuyển từ navbar vào bảng chi tiết game.

> Mọi thay đổi ở trên chỉ tác động thêm (additive) — không sửa đổi luồng đăng nhập/streaming lõi của GeForce NOW.

🔎 **Muốn tự đối chiếu?** So sánh trực tiếp bằng link này:
`https://github.com/OpenCloudGaming/OpenNOW/compare/v0.5.3...main`

## 🔒 Minh bạch & An toàn

Thay vì chỉ “cam kết suông” là không chứa mã độc, hãy để cộng đồng **tự kiểm chứng**:

1. **Mã nguồn công khai** — toàn bộ code nằm tại chính repo này / repo gốc, ai cũng có thể đọc và tự build.
2. **Build công khai qua CI** — nếu bạn dùng GitHub Actions để build (khuyên dùng), dán link log build vào đây để ai cũng xem được quá trình tạo ra file `.exe`.
3. **Checksum SHA256** — luôn đăng mã SHA256 của từng file trong phần Release để người dùng đối chiếu trước khi chạy:

   ```powershell
   certutil -hashfile OpenNOW-VN-v0.5.3-vn.1-setup-x64.exe SHA256
   ```

   | File | SHA256 |
   |---|---|
   | `OpenNOW-VN-v0.5.3-vn.1-setup-x64.exe` | `dán_hash_thật_vào_đây` |
   | `OpenNOW-VN-v0.5.3-vn.1-portable-x64.exe` | `dán_hash_thật_vào_đây` |

4. **Không thu thập dữ liệu ngoài nhu cầu** — ghi rõ bản build của bạn có hay không thêm bớt bất kỳ telemetry/tracking nào so với bản gốc.
5. Khuyến khích người dùng thận trọng: quét file bằng Windows Defender / VirusTotal trước khi chạy, và ưu tiên bản chính thức nếu không chắc chắn.

## 🚀 Cài đặt

1. Vào mục [**Releases**](../../releases) của repo này.
2. Tải file `OpenNOW-VN-...-setup-x64.exe` (hoặc bản portable nếu không muốn cài đặt).
3. (Khuyên dùng) Đối chiếu SHA256 với bảng ở trên.
4. Chạy file cài đặt, mở ứng dụng, đăng nhập bằng tài khoản GeForce NOW của bạn.
5. Vào **Settings** để tinh chỉnh độ phân giải, codec, độ trễ theo ý thích.

## 🤝 Nguồn gốc & Giấy phép

- Dự án gốc: **[OpenCloudGaming/OpenNOW](https://github.com/OpenCloudGaming/OpenNOW)** — toàn bộ công sức phát triển luồng streaming, ứng dụng gốc thuộc về đội ngũ và cộng tác viên OpenCloudGaming.
- Giấy phép: **[MIT License](LICENSE)** — giữ nguyên từ bản gốc, kèm thông báo bản quyền gốc.
- Bản build này chỉ nhằm mục đích **phổ biến và hỗ trợ cộng đồng người dùng Việt Nam**, không nhằm thay thế hay cạnh tranh với dự án gốc.
- Nếu đội ngũ OpenCloudGaming yêu cầu gỡ bỏ/điều chỉnh, repo này sẽ tuân thủ.

## 💬 Cộng đồng

- Discord: `dán link Discord của bạn`
- Zalo / Facebook Group: `dán link của bạn`
- Báo lỗi: mở [Issue](../../issues) trên repo này

<div align="center">

— Được đóng gói với ❤️ cho cộng đồng cloud gaming Việt Nam —

</div>
