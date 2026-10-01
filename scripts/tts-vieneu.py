# tts-vieneu.py — cầu nối gọi VieNeu-TTS từ gen-audio.js.
# Nạp model MỘT lần rồi tổng hợp tất cả các câu trong job file (rẻ hơn nhiều
# so với gọi lại từng câu). Text truyền qua file JSON (UTF-8) để tránh lỗi
# quoting dấu tiếng Việt trên dòng lệnh Windows.
# Cách dùng:
#   python tts-vieneu.py --voice "Thùy Dung" --jobs jobs.json
# jobs.json: [{"out": "đường-dẫn.wav", "text": "câu cần đọc"}, ...]
import argparse
import json
import sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', required=True, help='Tên giọng mẫu (vd: "Thùy Dung")')
    ap.add_argument('--jobs', required=True, help='File JSON danh sách câu cần đọc')
    args = ap.parse_args()

    with open(args.jobs, 'r', encoding='utf-8') as f:
        jobs = json.load(f)
    if not jobs:
        print('Không có job nào')
        return

    from vieneu import Vieneu
    v = Vieneu()  # v3 Turbo 48kHz, CPU/ONNX (không cần torch)

    for i, job in enumerate(jobs):
        audio = v.infer(job['text'], voice=args.voice)
        v.save(audio, job['out'])
        print(f"[{i + 1}/{len(jobs)}] OK: {job['out']}", flush=True)

if __name__ == '__main__':
    main()
