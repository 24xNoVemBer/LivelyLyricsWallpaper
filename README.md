# Spotify Lyrics Lively Wallpaper 🎵

A stunning, premium glassmorphic Now-Playing live wallpaper with synchronized scrolling lyrics and a customized 3D WebGL rotating tunnel background.

Vietnamese translation below / Hướng dẫn tiếng Việt ở bên dưới.

---

## ✨ Features

- **3D WebGL Music Tunnel Background**: A mesmerizing rotating/reflecting tunnel mimicking the classic Lively theme. Customizable via Lively settings (speed, cylindrical/square shape, backdrop glow, scaling, blur, and 30FPS lock).
- **Aesthetic Glassmorphic UI**: Beautiful central panel featuring cover art with dynamic ambient glow halos, smooth sliding transitions on song changes, and scrollable lyrics.
- **Synchronized Scrolling Lyrics**: Fetches lyrics automatically from LRCLIB and scrolls in real-time, using linear-gradient masks to fade out text at boundaries.
- **Desktop Playback Controls (Play/Pause, Skip, Previous)**:
  - **Automated Mode**: Intercepts controls using a silent background Python web helper that simulates native Windows media keys. Works out-of-the-box for Spotify, YouTube, VLC, etc. (No login needed!).
  - **Spotify Web API Mode**: Fallback control using official Spotify APIs.

---

## 🚀 Installation & Setup (English)

### 1. Add to Lively Wallpaper
1. Download **`SpotifyLyricsWallpaper.zip`** from this repository (or from the [Releases](https://github.com/24xNoVemBer/LivelyLyricsWallpaper/releases) page).
2. Open **Lively Wallpaper** and click **Add Wallpaper** (+ icon).
3. Drag and drop the downloaded `.zip` file into Lively Wallpaper, or browse and select it.
4. Set it as your active wallpaper.

### 2. Enable Native Playback Controls (Play/Pause/Skip)
To enable the media control buttons without registering Spotify developer keys, run our lightweight local helper:
1. Double-click **`run_helper.vbs`** in the wallpaper folder to launch the helper silently in the background.
2. **Auto-Start on Boot (Recommended)**:
   - Press `Win + R`, type `shell:startup` and press Enter to open the Windows Startup folder.
   - Right-click `run_helper.vbs`, select **Create Shortcut**.
   - Drag that shortcut into the Startup folder.
   - Now, the controls will work automatically every time you turn on your PC!

### 3. Connect to Spotify (Optional - For Direct Spotify API Control)
If you want to control Spotify playback directly via official Spotify Web APIs:
1. Hover or right-click your active wallpaper, open **Lively Customise / Settings**, and click the **Connect Spotify** button on the interface.
2. A configuration modal will pop up. Follow these steps:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
   - Click **Create App** (or use an existing one). Put any name and description.
   - Under App settings, add the Redirect URI: `http://127.0.0.1:8888/` and save/update the settings.
   - Copy the **Client ID** from the Spotify Dashboard and paste it into the **Client ID** box on the wallpaper config modal.
   - Click **1. Login**. A browser tab will open requesting you to authorize the app.
   - After authorizing, the browser will redirect to a URL like `http://127.0.0.1:8888/?code=...` which will show a connection error (this is completely normal as no local server is listening on port 8888).
   - Copy the **entire URL** from the browser's address bar.
   - Paste that URL into the **Redirect URL** box on the wallpaper config modal.
   - Click **2. Save** to complete the connection.

---

# Hướng dẫn Tiếng Việt 🇻🇳

Hình nền Lively hiển thị lời bài hát (Lyrics) đồng bộ thời gian thực với hiệu ứng hầm WebGL 3D xoay chiều độc đáo và giao diện kính mờ sang trọng.

## ✨ Tính năng chính

- **Nền hầm xoay WebGL 3D**: Tùy chỉnh trực tiếp từ cài đặt Lively (Tốc độ, hình dạng hầm vuông/tròn, độ sáng tâm hầm, độ mờ hầm, giới hạn 30FPS).
- **Bộ nút Điều khiển nhạc trên màn hình**: Nhấp chuyển bài, tạm dừng nhạc nhanh gọn trực tiếp trên giao diện hình nền.
- **Tự động hóa hoàn toàn qua Media Helper**: Không cần đăng nhập API. Chạy ngầm mô phỏng phím bấm hệ thống giúp điều khiển cả Spotify, YouTube, Chrome, VLC,...

## 🚀 Hướng dẫn cài đặt & Thiết lập

### 1. Cài đặt hình nền vào Lively
1. Tải tệp tin **`SpotifyLyricsWallpaper.zip`** trực tiếp từ repository (hoặc từ trang [Releases](https://github.com/24xNoVemBer/LivelyLyricsWallpaper/releases)).
2. Mở ứng dụng **Lively Wallpaper**, bấm chọn **Add Wallpaper** (Thêm hình nền, biểu tượng dấu cộng `+`).
3. Kéo và thả tệp `.zip` đã tải vào Lively Wallpaper, hoặc bấm duyệt tìm và chọn tệp `.zip` này.
4. Thiết lập nó làm hình nền hoạt động của bạn.

### 2. Kích hoạt bộ điều khiển nhạc (Phát/Tạm dừng/Chuyển bài)
1. Nhấp đúp chuột vào tệp **`run_helper.vbs`** để kích hoạt công cụ chạy ngầm điều khiển phím tắt hệ thống.
2. **Cài đặt khởi động cùng Win**:
   - Nhấn tổ hợp phím `Windows + R`, gõ **`shell:startup`** và nhấn **Enter**.
   - Chuột phải vào tệp `run_helper.vbs` -> chọn **Create Shortcut**.
   - Kéo tệp Shortcut vừa tạo thả vào cửa sổ thư mục Startup.

### 3. Kết nối tài khoản Spotify (Tùy chọn - Để điều khiển trực tiếp qua Spotify API)
Để điều khiển bài hát trực tiếp bằng API chính thức của Spotify:
1. Di chuột vào hình nền hoặc chọn hình nền đang chạy, bấm nút **Connect Spotify** trên giao diện điều khiển.
2. Bảng cấu hình kết nối hiện lên, làm theo các bước sau:
   - Truy cập trang [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) và đăng nhập bằng tài khoản của bạn.
   - Nhấp vào **Create App** (Tạo ứng dụng). Đặt tên và mô tả bất kỳ.
   - Trong cài đặt ứng dụng (App Settings), thêm Redirect URI là: `http://127.0.0.1:8888/` rồi bấm lưu cài đặt.
   - Sao chép **Client ID** từ Dashboard của Spotify và dán vào ô **Client ID** trên bảng cấu hình hình nền.
   - Bấm nút **1. Login** (Đăng nhập). Một cửa sổ trình duyệt mới sẽ mở ra yêu cầu cấp quyền.
   - Sau khi cấp quyền xong, trình duyệt chuyển hướng đến một trang báo lỗi (Ví dụ: `Không thể kết nối đến trang web`, điều này là bình thường vì không có máy chủ cục bộ chạy ở cổng 8888).
   - Hãy sao chép **toàn bộ đường dẫn URL** trên thanh địa chỉ của trình duyệt lúc đó (trong đó có chứa `?code=...`).
   - Dán URL vừa sao chép vào ô **Redirect URL** ở bảng cấu hình.
   - Nhấp chọn **2. Save** (Lưu lại) để hoàn thành kết nối.

---

## 🛠️ Development & Packaging / Đóng gói hình nền

If you modify the source files and want to package a new version:
Nếu bạn chỉnh sửa file nguồn và muốn đóng gói lại phiên bản mới:

1. Open PowerShell in the project directory.
2. Run the packaging script:
   ```powershell
   ./pack.ps1
   ```
3. A new `SpotifyLyricsWallpaper.zip` (and `.lively` / `.rar`) will be generated. You can attach these files to your releases or share them directly!
