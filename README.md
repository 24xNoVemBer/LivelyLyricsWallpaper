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

## 🚀 Installation & Setup

### 1. Add to Lively Wallpaper
1. Download the latest **`SpotifyLyricsWallpaper.lively`** package.
2. Drag and drop the `.lively` file directly into your **Lively Wallpaper** library.
3. Set it as your active wallpaper.

### 2. Enable Native Playback Controls (Play/Pause/Skip)
To enable the media control buttons without registering Spotify developer keys, run our lightweight local helper:
1. Double-click **`run_helper.vbs`** in the wallpaper folder to launch the helper silently in the background.
2. **Auto-Start on Boot (Recommended)**:
   - Press `Win + R`, type `shell:startup` and press Enter to open the Windows Startup folder.
   - Right-click `run_helper.vbs`, select **Create Shortcut**.
   - Drag that shortcut into the Startup folder.
   - Now, the controls will work automatically every time you turn on your PC!

---

# Hướng dẫn Tiếng Việt 🇻🇳

Hình nền Lively hiển thị lời bài hát (Lyrics) đồng bộ thời gian thực với hiệu ứng hầm WebGL 3D xoay chiều độc đáo và giao diện kính mờ sang trọng.

## ✨ Tính năng chính

- **Nền hầm xoay WebGL 3D**: Tùy chỉnh trực tiếp từ cài đặt Lively (Tốc độ, hình dạng hầm vuông/tròn, độ sáng tâm hầm, độ mờ hầm, giới hạn 30FPS).
- **Bộ nút Điều khiển nhạc trên màn hình**: Nhấp chuyển bài, tạm dừng nhạc nhanh gọn trực tiếp trên giao diện hình nền.
- **Tự động hóa hoàn toàn qua Media Helper**: Không cần đăng nhập API. Chạy ngầm mô phỏng phím bấm hệ thống giúp điều khiển cả Spotify, YouTube, Chrome, VLC,...

## 🚀 Hướng dẫn cài đặt

### 1. Cài đặt hình nền vào Lively
1. Tải về file **`SpotifyLyricsWallpaper.lively`**.
2. Kéo thả file này trực tiếp vào thư viện ứng dụng **Lively Wallpaper** để cài đặt.

### 2. Kích hoạt bộ điều khiển nhạc (Phát/Tạm dừng/Chuyển bài)
1. Nhấp đúp chuột vào tệp **`run_helper.vbs`** để kích hoạt công cụ chạy ngầm điều khiển phím tắt hệ thống.
2. **Cài đặt khởi động cùng Win**:
   - Nhấn tổ hợp phím `Windows + R`, gõ **`shell:startup`** và nhấn **Enter**.
   - Chuột phải vào tệp `run_helper.vbs` -> chọn **Create Shortcut**.
   - Kéo tệp Shortcut vừa tạo thả vào cửa sổ thư mục Startup.
