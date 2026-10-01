# Sinh kịch bản & content.json bằng Gemini

Engine chỉ là "máy chiếu" — nội dung mới là linh hồn của video. Thay vì viết tay
`content.json`, bạn có thể **dùng Gemini để sinh kịch bản và nội dung** theo đúng
schema của engine, rồi chỉ việc render.

## Quy trình 5 bước

1. **Mở Gemini**, dán prompt mẫu ở dưới + điền chủ đề của bạn vào chỗ `[CHỦ ĐỀ]`.
2. Gemini trả về **một khối JSON duy nhất**. Lưu thành `content/<ten-video>.json`.
3. Kiểm tra hợp lệ: `npm run validate -- content/<ten-video>.json`
4. Tạo giọng đọc + nhạc + SFX: `npm run gen-audio` (lần đầu cần mạng hoặc venv ViNeu).
5. Render MP4: `npm run render -- content/<ten-video>.json`

Nếu validate báo lỗi, dán thông báo lỗi vào Gemini và yêu cầu sửa — thường 1–2 lượt là đạt.

## Prompt mẫu (copy nguyên khối, thay `[CHỦ ĐỀ]`)

```text
Bạn là biên kịch video dọc TikTok/Reels chuyên về tài chính cá nhân, giọng văn
gần gũi, câu ngắn, không sáo rỗng. Hãy viết kịch bản video ngắn và xuất kết quả
dưới dạng MỘT khối JSON duy nhất (không giải thích, không markdown, không ```json).

Chủ đề: [CHỦ ĐỀ]

Yêu cầu schema bắt buộc (đúng từng trường, engine sẽ từ chối nếu sai):

{
  "meta": {
    "title": "<slug-ngan-khong-dau-khoang>",   // dùng làm tên file MP4
    "format": "vertical",
    "fps": 30,
    "theme": "dark-navy",                      // "dark-navy" hoặc "light-clean"
    "language": "vi"
  },
  "audio": {
    "musicVolume": 0.22,
    "musicFadeOut": 2.5,
    "manifest": "/assets/audio/manifest.json",
    "narration": { "provider": "vieneu", "voice": "Thùy Dung", "delay": 0.3 }
  },
  "scenes": [
    // 6–9 scene, mỗi scene một trong các type sau:
    // title, bullets, bar-chart, line-chart, number-counter, comparison, quote, outro
  ],
  "transition": { "type": "slide-up", "duration": 0.4 }
}

Quy tắc nội dung:
- Mở đầu bằng scene "title" (badge, heading ≤ 40 ký tự, highlight mảng từ khoá
  cần tô màu, subheading), kết thúc bằng scene "outro" (heading + handle kênh).
- Mỗi scene có "narration": lời đọc 1–2 câu, TỰ NHIÊN như người nói, viết SỐ RA
  CHỮ để đọc rõ (vd "hai mươi triệu", "năm mươi phần trăm", "bốn mươi tám").
- Nhịp đọc tiếng Việt ~20–25 ký tự/giây: đặt duration sao cho
  (0.3 + số ký tự narration ÷ 22) ≤ duration. Scene dài nhất tối đa 8.5s.
- Narration phải ĐI QUA TỪNG ĐIỂM hiển thị trên màn hình (mọi con số, mọi dòng
  bullet, cả 2 bên comparison) — người xem vừa nghe vừa thấy thống nhất.
- bullets: 2–6 dòng, mỗi dòng ≤ 30 ký tự. comparison: left.items và right.items
  đều 2–4 dòng, mỗi dòng ≤ 24 ký tự. bar-chart/line-chart: 3–6 điểm dữ liệu,
  số liệu thực tế, hợp lý với chủ đề.
- Scene "quote": câu ngắn có trọng lượng, kèm "source".
- Tổng thời lượng toàn video 35–60 giây.
- Không dùng emoji trong heading, chỉ dùng trong text cuối nếu thật cần.

Sau khối JSON, KHÔNG viết gì thêm.
```

## Checklist sau khi nhận JSON từ Gemini

- [ ] JSON parse được (dán vào `content/` rồi chạy `npm run validate -- content/x.json`).
- [ ] Mỗi scene có `narration`, số liệu đọc ra chữ.
- [ ] So `duration` với độ dài narration khi `gen-audio` in ra — nếu bị cảnh báo
      "vượt duration", tăng `duration` hoặc yêu cầu Gemini rút gọn câu đó.
- [ ] `meta.title` không dấu, không khoảng trắng (nó thành tên file MP4).

## Mẹo nâng cao

- **Đa dạng góc nhìn**: yêu cầu Gemini sinh 3 phương án kịch bản khác nhau
  (ví dụ: kể chuyện / số liệu / so sánh trước–sau) rồi chọn phương án ưng nhất.
- **Chuỗi video**: cho Gemini kịch bản video đầu, yêu cầu viết tiếp 5 chủ đề
  liên quan để làm series.
- **Đổi theme**: chỉ cần đổi `"theme"` trong `meta` — nội dung không đổi.
- **Voice clone riêng**: VieNeu hỗ trợ clone từ 3–5s mẫu tiếng — xem README mục giọng đọc.
