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
    "theme": "vn-trend",
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
chủ đề là gì. Tương tự, "meta.theme" LUÔN LUÔN là "vn-trend" — không dùng
"dark-navy" hay theme nào khác.

Quy tắc nội dung:
- Mở đầu bằng scene "title": có "badge", "heading" (≤ 40 ký tự), "subheading",
  và BẮT BUỘC field "highlight" (chú ý: số ÍT, không phải "highlights") —
  LUÔN LUÔN là MỘT MẢNG chuỗi, ví dụ đúng: "highlight": ["3 bước"] — KHÔNG
  BAO GIỜ được viết thành chuỗi thường như "highlight": "3 bước". Mỗi phần tử
  trong mảng phải là 1 cụm từ xuất hiện nguyên văn trong "heading".
  Kết thúc bằng scene "outro" (heading + handle kênh, handle cố định là
  "@VNTrend").
- Mỗi scene có "narration": lời đọc 1-2 câu, TỰ NHIÊN như người nói, viết SỐ RA
  CHỮ để đọc rõ (vd "hai mươi triệu", "năm mươi phần trăm").
- Nhịp đọc tiếng Việt ~20-25 ký tự/giây: đặt duration sao cho
  (0.3 + số ký tự narration ÷ 22) ≤ duration. Scene dài nhất tối đa 8.5s.
- Narration phải ĐI QUA TỪNG ĐIỂM hiển thị trên màn hình (mọi con số, mọi dòng
  bullet, cả 2 bên comparison).
- bullets: 2-6 dòng, mỗi dòng ≤ 30 ký tự. comparison: left.items/right.items
  2-4 dòng, mỗi dòng ≤ 24 ký tự.
- bar-chart/line-chart: schema bắt buộc {"heading", "unit", "data": [{"label",
  "value"}, ...]} với 3-6 điểm. BẮT BUỘC 3 thứ này phải KHỚP NHAU THÀNH 1 CÂU
  CHUYỆN DUY NHẤT — "heading" nêu rõ đang đo cái gì, "label" của từng điểm là
  tên giai đoạn/mốc thời gian/nhóm CÓ Ý NGHĨA (không dùng "A, B, C" hay nhãn
  chung chung), và "narration" của scene đó PHẢI NÊU RÕ xu hướng/so sánh mà
  chính các "value" thể hiện (tăng từ đâu đến đâu, cái nào cao hơn cái nào và
  vì sao điều đó quan trọng) — người xem phải hiểu được biểu đồ đang chứng minh
  điều gì chỉ qua lời đọc, không chỉ nhìn số.
  Ví dụ ĐÚNG: heading "Khối lượng giao dịch 3 phiên", unit "triệu CP", data
  [{"label":"Phiên tích lũy","value":12},{"label":"Phiên breakout","value":45},
  {"label":"Phiên xác nhận","value":28}], narration "Khối lượng vọt từ mười
  hai lên bốn mươi lăm triệu cổ phiếu đúng phiên breakout — dấu hiệu dòng tiền
  lớn nhập cuộc."
  Ví dụ SAI (không được làm): data [{"label":"A","value":50},{"label":"B",
  "value":30},{"label":"C","value":20}] mà narration chỉ nói chung chung
  không nhắc gì tới 50/30/20 hay ý nghĩa của A/B/C.
  Đây là nội dung kiến thức minh hoạ, KHÔNG phải số liệu giao dịch thật, không
  gắn số liệu đó với 1 mã cổ phiếu cụ thể nào.
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


MAX_FIX_ATTEMPTS = 3  # theo đúng khuyến nghị trong docs/sinh-noi-dung-voi-gemini.md
                      # ("thường 1-2 lượt là đạt") — để dư 1 lượt cho chắc.

VALIDATE_JS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "validate.js")


def validate_json_file(path):
    """Gọi ĐÚNG script validate.js của chính dự án (không viết lại logic riêng ở
    Python, tránh 2 nơi kiểm tra lệch nhau) — trả về (hợp_lệ, log_đầy_đủ)."""
    import subprocess

    result = subprocess.run(
        ["node", VALIDATE_JS, path],
        capture_output=True,
        text=True,
    )
    full_output = (result.stdout or "") + (result.stderr or "")
    return result.returncode == 0, full_output.strip()


def _call_model(client, model_name, history):
    response = client.models.generate_content(
        model=model_name,
        contents=history,
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Model trả về nội dung rỗng")
    return text


def generate(topic, tmp_path):
    """Sinh content.json, rồi TỰ VALIDATE bằng đúng scripts/validate.js của dự án;
    nếu lỗi, gửi lại y nguyên lỗi cho Gemini (cùng model, cùng cuộc hội thoại) để
    sửa — lặp tối đa MAX_FIX_ATTEMPTS lần trước khi chịu thua. `tmp_path` dùng để
    ghi file tạm mỗi vòng lặp (validate.js cần đọc từ file, không nhận JSON qua
    stdin)."""
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
        history = [types.Content(role="user", parts=[types.Part(text=user_prompt)])]
        try:
            text = _call_model(client, model_name, history)
        except Exception as e:
            log(f"[warn] Model {model_name} lỗi ngay từ đầu: {e}")
            last_error = e
            continue

        log(f"[info] Dùng model: {model_name}")
        history.append(types.Content(role="model", parts=[types.Part(text=text)]))

        for attempt in range(1, MAX_FIX_ATTEMPTS + 1):
            try:
                data = extract_json(text)
            except Exception as e:
                log(f"[warn] Không bóc được JSON (lần {attempt}): {e}")
                data = None

            if data is not None:
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                ok, validate_log = validate_json_file(tmp_path)
                if ok:
                    if attempt > 1:
                        log(f"[info] Đã tự sửa thành công sau {attempt} lần.")
                    return data
                log(f"[warn] validate.js báo lỗi (lần {attempt}/{MAX_FIX_ATTEMPTS}):\n{validate_log}")
            else:
                validate_log = "Không bóc được JSON hợp lệ từ phản hồi trước — hãy trả lại ĐÚNG MỘT khối JSON duy nhất."

            if attempt == MAX_FIX_ATTEMPTS:
                break  # hết lượt, thoát vòng lặp fix, rớt xuống thử model tiếp theo

            fix_prompt = (
                "Nội dung JSON bạn vừa tạo bị lỗi khi chạy qua trình kiểm tra của dự án:\n\n"
                f"{validate_log}\n\n"
                "Hãy sửa đúng những lỗi trên và trả lại TOÀN BỘ JSON đã sửa (giữ nguyên "
                "mọi phần không liên quan tới lỗi) — chỉ MỘT khối JSON duy nhất, không "
                "markdown, không giải thích gì thêm."
            )
            history.append(types.Content(role="user", parts=[types.Part(text=fix_prompt)]))
            try:
                text = _call_model(client, model_name, history)
            except Exception as e:
                log(f"[warn] Model {model_name} lỗi khi đang sửa (lần {attempt}): {e}")
                last_error = e
                break
            history.append(types.Content(role="model", parts=[types.Part(text=text)]))

        log(f"[warn] Model {model_name} vẫn lỗi sau {MAX_FIX_ATTEMPTS} lần sửa, chuyển model khác.")
        last_error = last_error or RuntimeError("Hết lượt tự sửa mà vẫn không hợp lệ")

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

    tmp_path = "/tmp/gen_content_wip.json"
    data = generate(args.topic, tmp_path)

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
