"""
gen_content.py

Sinh content.json cho video-template-engine bằng Gemini, theo đúng schema và
quy tắc đã mô tả trong docs/sinh-noi-dung-voi-gemini.md — nhưng ÉP dùng
provider TTS "edge" (msedge-tts, Node thuần, chỉ cần mạng) thay vì "vieneu"
(cần cài thêm Python + tải model cục bộ) để chạy gọn trên GitHub Actions,
không cần bước setup nào ngoài `npm install`.

Chạy:
  python scripts/gen_content.py                        # Gemini tự chọn chủ đề
  python scripts/gen_content.py --topic "cắt lỗ là gì"  # chỉ định chủ đề
  python scripts/gen_content.py --out content/x.json    # chỉ định nơi lưu

In ra stdout DUY NHẤT đường dẫn file đã ghi (để workflow bắt qua $(...)) —
mọi log khác (info/warn) đều in ra stderr, không lẫn vào kết quả.

Biến môi trường cần có: GEMINI_API_KEY
"""

import os
import sys
import json
import re
import argparse

from google import genai
from google.genai import types

# Giống hệt chain đang dùng ổn định bên repo đăng bài text/ảnh — tái dùng để
# khỏi phải dò lại từ đầu model nào khả dụng.
MODEL_FALLBACK_CHAIN = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
]

SYSTEM_PROMPT = """Bạn là biên kịch video dọc TikTok/Reels chuyên về tài chính cá nhân và đầu tư
chứng khoán Việt Nam cho trang "VN Trend", giọng văn gần gũi, câu ngắn, không
sáo rỗng, theo góc nhìn trend-following (KHÔNG khuyến nghị mua/bán mã cụ thể).
Hãy viết kịch bản video ngắn và xuất kết quả dưới dạng MỘT khối JSON duy nhất
(không giải thích, không markdown, không ```json, không viết gì trước/sau
khối JSON).

Yêu cầu schema bắt buộc (đúng từng trường, engine sẽ từ chối nếu sai):

{
  "meta": {
    "title": "<slug-ngan-khong-dau-khoang>",
    "format": "vertical",
    "fps": 30,
    "theme": "dark-navy",
    "language": "vi"
  },
  "audio": {
    "musicVolume": 0.22,
    "musicFadeOut": 2.5,
    "manifest": "/assets/audio/manifest.json",
    "narration": { "provider": "edge", "voice": "vi-VN-HoaiMyNeural", "rate": "+12%", "delay": 0.3 }
  },
  "scenes": [
    // 6-9 scene, mỗi scene một trong: title, bullets, bar-chart, line-chart,
    // number-counter, comparison, quote, outro
  ],
  "transition": { "type": "slide-up", "duration": 0.4 }
}

QUAN TRỌNG: trường "audio.narration.provider" LUÔN LUÔN là "edge", "voice" LUÔN
LUÔN là "vi-VN-HoaiMyNeural" — không được đổi sang "vieneu" hay giọng khác dù
chủ đề là gì.

Quy tắc nội dung:
- Mở đầu bằng scene "title" (badge, heading ≤ 40 ký tự, highlight mảng từ khoá
  cần tô màu, subheading), kết thúc bằng scene "outro" (heading + handle kênh,
  handle cố định là "@VNTrend").
- Mỗi scene có "narration": lời đọc 1-2 câu, TỰ NHIÊN như người nói, viết SỐ RA
  CHỮ để đọc rõ (vd "hai mươi triệu", "năm mươi phần trăm").
- Nhịp đọc tiếng Việt ~20-25 ký tự/giây: đặt duration sao cho
  (0.3 + số ký tự narration ÷ 22) ≤ duration. Scene dài nhất tối đa 8.5s.
- Narration phải ĐI QUA TỪNG ĐIỂM hiển thị trên màn hình (mọi con số, mọi dòng
  bullet, cả 2 bên comparison).
- bullets: 2-6 dòng, mỗi dòng ≤ 30 ký tự. comparison: left.items/right.items
  2-4 dòng, mỗi dòng ≤ 24 ký tự. bar-chart/line-chart: 3-6 điểm dữ liệu MINH
  HOẠ hợp lý với chủ đề — đây là nội dung kiến thức minh hoạ, KHÔNG phải số
  liệu giao dịch thật, không gắn số liệu đó với 1 mã cổ phiếu cụ thể nào.
- Scene "quote": câu ngắn có trọng lượng, kèm "source": "VN Trend".
- Tổng thời lượng toàn video 35-60 giây.
- Không dùng emoji trong heading.
- LUÔN kết thúc nội dung (ở scene outro hoặc bullets cuối) bằng 1 câu nhắc:
  đây là góc nhìn cá nhân theo phương pháp trend following, không phải khuyến
  nghị đầu tư.

Sau khối JSON, KHÔNG viết gì thêm."""


def log(msg):
    print(msg, file=sys.stderr)


def extract_json(text):
    text = text.strip()
    # Gemini đôi khi vẫn kèm ```json ... ``` dù đã dặn kỹ — tự bóc ra cho chắc.
    text = re.sub(r"^```(json)?\s*|\s*```$", "", text.strip())
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError("Không tìm thấy khối JSON trong phản hồi của Gemini")
    return json.loads(m.group(0))


def generate(topic):
    api_key = os.environ["GEMINI_API_KEY"]
    client = genai.Client(api_key=api_key)
    user_prompt = (
        f"Chủ đề: {topic}"
        if topic
        else (
            "Chủ đề: (tự chọn 1 chủ đề thú vị, hữu ích về đầu tư/chứng khoán Việt "
            "Nam cho nhà đầu tư cá nhân mới bắt đầu — tránh các chủ đề đã quá quen "
            "thuộc như 'cắt lỗ là gì')"
        )
    )
    last_error = None
    for model_name in MODEL_FALLBACK_CHAIN:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            )
            text = (response.text or "").strip()
            if not text:
                raise ValueError("Model trả về nội dung rỗng")
            data = extract_json(text)
            log(f"[info] Dùng model: {model_name}")
            return data
        except Exception as e:
            log(f"[warn] Model {model_name} lỗi: {e}")
            last_error = e
            continue
    raise RuntimeError(f"Tất cả model trong MODEL_FALLBACK_CHAIN đều lỗi. Lỗi cuối cùng: {last_error}")


def build_caption(data):
    """Ghép caption Facebook từ chính các dòng "narration" trong content.json —
    lời đọc vốn đã tự nhiên và đi qua đúng từng điểm của video, dùng làm caption
    luôn thay vì phải sinh thêm 1 lần gọi Gemini riêng."""
    lines = []
    for scene in data.get("scenes", []):
        narration = scene.get("narration")
        if isinstance(narration, str) and narration.strip():
            lines.append(narration.strip())
    caption = "\n\n".join(lines)
    caption += "\n\n#VNTrend #ChungKhoanVietNam #TrendFollowing #DauTuChungKhoan"
    return caption


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", default=None, help="Chủ đề video. Bỏ trống để Gemini tự chọn.")
    parser.add_argument("--out", default=None, help="Đường dẫn file JSON xuất ra. Mặc định content/<title>.json")
    args = parser.parse_args()

    data = generate(args.topic)

    title = data.get("meta", {}).get("title", "video-tu-dong")
    out_path = args.out or f"content/{title}.json"
    caption_path = out_path.rsplit(".", 1)[0] + ".caption.txt"

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    with open(caption_path, "w", encoding="utf-8") as f:
        f.write(build_caption(data))

    log(f"[ok] Đã ghi {out_path}")
    log(f"[ok] Đã ghi {caption_path}")
    print(out_path)  # DUY NHẤT dòng này ra stdout — để workflow bắt qua $(...)


if __name__ == "__main__":
    main()
