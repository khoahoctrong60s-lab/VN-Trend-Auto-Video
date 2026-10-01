# Video Template Engine

Hệ thống tạo video motion-graphics hoàn toàn từ dữ liệu: bạn viết file JSON,
chạy một lệnh, nhận ra video MP4 (1080×1920 dọc / 1920×1080 ngang / 1080×1080 vuông).
**Không cần sửa code HTML/JS khi đổi chủ đề.**

```
JSON (nội dung)  →  HTML animation (engine + scenes + theme)  →  MP4
content/*.json      engine/player.html?render=1                  output/*.mp4
```

## Cài đặt

1. **Node.js** ≥ 18: tải tại [nodejs.org](https://nodejs.org)
   (kiểm tra: `node --version`).
2. **FFmpeg** (một trong hai cách):
   - Không cần làm gì: dự án tự dùng gói `ffmpeg-static` (đã có trong dependencies).
   - Hoặc tự cài: Windows `winget install Gyan.FFmpeg` · macOS `brew install ffmpeg` · Linux `sudo apt install ffmpeg`.
3. Cài dependencies:

```bash
npm install
```

## Sử dụng

```bash
npm run render                          # render content/content.json
npm run render -- content/examples/3-buoc-trien-khai.json   # render file khác
npm run render:all                      # render tất cả .json trong content/
npm run render:all -- content/examples  # render tất cả .json trong 1 thư mục
npm run validate                        # chỉ kiểm tra content, không render
npm run check:determinism               # kiểm tra render có lặp lại giống hệt không
npm run preview                         # mở player xem thử trong trình duyệt
```

**Render deterministic:** engine không dùng CSS animation hay setTimeout — mọi khung
được vẽ lại từ `window.setTime(t)`, và Chrome chạy với cờ tắt GPU/subpixel
(nhờ đó cùng một `content.json` luôn cho hai file MP4 giống hệt nhau ở mức khung).
`npm run check:determinism` chụp các khung thử nhiều lần để xác nhận.

Cờ hữu ích của `render`:

| Cờ | Ý nghĩa |
|---|---|
| `--preview` | Render nhanh thử: 15fps, nửa độ phân giải |
| `--jpeg` | Chụp khung JPEG thay vì PNG (nhanh hơn nhiều, chất lượng 95) |
| `--workers N` | Chụp song song bằng N tab (máy nhiều nhân CPU mới nên dùng; mặc định 1) |
| `--keep-frames` | Giữ lại thư mục khung hình tạm để kiểm tra |
| `--out đường/dẫn.mp4` | Chọn nơi xuất video |

Video ra nằm trong `output/`, đặt tên theo `meta.title`.

## Viết content.json

```jsonc
{
  "meta": {
    "title": "ten-video",        // dùng đặt tên file output
    "format": "vertical",        // vertical | horizontal | square
    "fps": 30,
    "theme": "dark-navy",        // tên file trong themes/
    "language": "vi"
  },
  "audio": {                     // tùy chọn — làm video có tiếng như video thật
    "manifest": "/assets/audio/manifest.json",
    "musicVolume": 0.22,         // nhạc nền: dùng file audio.music nếu có,
    "musicFadeOut": 2.5,         //   nếu không engine tự tổng hợp pad hợp âm đúng độ dài video
    "narration": {               // giọng đọc TTS neural (cần mạng khi tạo lần đầu)
      "voice": "vi-VN-HoaiMyNeural",
      "rate": "+12%",
      "delay": 0.3               // bắt đầu đọc sau 0.3s đầu mỗi scene
    }
  },
  "scenes": [ /* xem bảng dưới */ ],
  "transition": { "type": "slide-up", "duration": 0.4 }   // fade | slide-up | none
}
```

Tổng thời lượng = tổng `duration` các scene. Thiếu trường không bắt buộc sẽ
dùng mặc định. Các scene khả dụng:

| type | Trường chính | Hiệu ứng |
|---|---|---|
| `title` | `badge`, `heading`, `highlight` (mảng từ tô nhấn), `subheading` | Từng khối trượt lên hiện dần |
| `bullets` | `heading`, `items` (≤6 dòng) | Các dòng lần lượt trượt vào |
| `bar-chart` | `heading`, `unit`, `data: [{label, value}]` | Cột mọc lên, số đếm tăng dần |
| `line-chart` | `heading`, `unit`, `data` (≥2 điểm) | Đường vẽ dần, điểm nhấn nổi lên |
| `number-counter` | `value`, `unit`, `caption` | Số đếm từ 0, vòng tròn tiến độ |
| `comparison` | `heading`, `left: {title, items}`, `right: {...}` | 2 thẻ hiện dần, dòng lần lượt |
| `quote` | `text`, `source` | Chữ hiện theo từng từ |
| `outro` | `heading`, `handle` | Lời kêu gọi + handle kênh |

Mẹo:
- **Giọng đọc & âm thanh:** thêm `"narration": "câu đọc..."` cho từng scene,
  rồi chạy `npm run gen-audio` (tạo lời đọc, nhạc nền và 23 SFX khớp hiệu ứng
  vào `assets/audio/`). Lệnh render tự gọi gen-audio nếu thiếu.
  Hai provider TTS:
  - **VieNeu-TTS** (mặc định khi đặt `"provider": "vieneu"`) — chạy cục bộ
    trên CPU, chất lượng tự nhiên, dùng giọng mẫu tiếng Việt theo tên
    (`Thùy Dung`, `Trúc Ly`, `Hải Đăng`, `Quang Sơn`... — xem hết bằng
    `uv run .venv-tts` script `scripts/list-vieneu-voices.py`).
    Cài một lần: `pip install uv` rồi
    `uv venv .venv-tts --python 3.12 && uv pip install --python .venv-tts/Scripts/python.exe vieneu`.
  - **Edge Neural** (`"provider": "edge"`) — qua mạng, giọng `vi-*`
    (vd `vi-VN-HoaiMyNeural`), hỗ trợ chỉnh tốc độ bằng `"rate": "+12%"`.
  Khi xem thử trên player có nút 🔊 tắt/bật tiếng và lời đọc chạy theo timeline.
- Chữ tiếng Việt: font mặc định Be Vietnam Pro đã nằm cục bộ trong
  `assets/fonts/` (không tải mạng khi render). Muốn font khác, thêm
  `@font-face` trong `engine/player.html` và đặt file vào đó.
- Tiêu đề dài engine tự co cỡ chữ; vẫn nên giữ heading ≤ ~60 ký tự.
- An toàn UI TikTok/Reels: engine đã chừa 150px trên + 250px dưới (vertical).

## Sinh nội dung bằng Gemini

Không muốn viết content.json tay? Xem [docs/sinh-noi-dung-voi-gemini.md](docs/sinh-noi-dung-voi-gemini.md) —
có sẵn **prompt mẫu để Gemini sinh kịch bản + JSON đúng schema**, quy trình 5 bước
(từ chủ đề → JSON → validate → gen-audio → MP4) và checklist kiểm tra kết quả.

## Thêm scene mới (không sửa engine)

1. Tạo file `engine/scenes/ten-scene.js` với cấu trúc:

```js
Engine.registerScene({
  type: 'ten-scene',
  defaults: { duration: 4 },
  validate: function (data) { return []; },  // trả về mảng lỗi
  render: function (container, p, t, ctx) {
    // container: div chứa scene — xóa và vẽ lại mỗi lần gọi
    // p: tiến độ 0..1 của scene · t: giây cục bộ
    // ctx: { theme, easing, width, height, safe, sceneData, sceneDuration, fps }
    container.innerHTML = '';
    // ... tạo DOM, mọi giá trị tính từ p/t — CẤM setTimeout/CSS animation
  },
});
```

2. Thêm tên file vào mảng `sceneFiles` trong `engine/scenes.js`.
3. Thêm type tương ứng vào `KNOWN_TYPES` trong `scripts/validate.js`.

## Thêm theme mới

Tạo file `themes/ten-theme.json`:

```json
{
  "colors": { "bg": "#0a1a44", "text": "#ffffff", "accent1": "#3ec6ff",
              "accent2": "#ffb02e", "accent3": "#d4e21a", "muted": "#8fa3c8" },
  "fonts": { "heading": "Be Vietnam Pro", "body": "Be Vietnam Pro" },
  "sizes": { "h1": 96, "h2": 64, "body": 44, "caption": 32 },
  "safeMargin": 80
}
```

Rồi dùng `"theme": "ten-theme"` trong content. Xem thử nhanh một theme:
`npm run preview` rồi mở `http://127.0.0.1:8788/engine/player.html?theme=light-clean`.

## Kiểm tra & hỗ trợ

```bash
node scripts/smoke-test.js content/content.json out-dir   # nạp player, chụp từng scene, bắt lỗi JS
node scripts/analyze-frames.js out-dir                    # phân tích pixel: vùng an toàn, frame trống
```

Yêu cầu đã đạt: render 100% từ JSON, deterministic (cùng input ra cùng
video, mọi animation tính từ t), hoạt động offline, 30fps mượt, chữ tiếng
Việt đúng dấu.
