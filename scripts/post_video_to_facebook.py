"""
post_video_to_facebook.py

Đăng 1 file MP4 lên Facebook Page qua Graph API. Khác hẳn luồng đăng ẢNH ở
repo "Quét VNTrend và đăng bài tự động" (post_to_facebook() ở đó chỉ xử lý
ảnh) — video dùng edge /{page-id}/videos riêng.

LƯU Ý QUAN TRỌNG VỀ HOST: tài liệu cũ trên mạng hay ghi host
"graph-video.facebook.com" cho việc này — host đó ĐÃ BỊ META KHAI TỬ
(deprecated). Theo tài liệu hiện hành (kiểm tra 01/10/2026), phải dùng đúng
host "graph.facebook.com" như mọi endpoint khác. Nếu sau này đổi lại thì sửa
đúng 1 chỗ GRAPH_API_VERSION/host bên dưới.

Cách upload multipart/form-data trực tiếp (dùng ở đây) chỉ áp dụng cho video
dưới 1GB / dưới 20 phút — thừa đủ cho video 35-60 giây mà video-template-engine
xuất ra. Nếu sau này cần video lớn hơn, phải chuyển sang Resumable Upload API
(3 bước: start -> transfer -> finish) — CHƯA triển khai ở đây.

Chạy:
  python scripts/post_video_to_facebook.py <file.mp4> "<caption>" [--dry-run]

Biến môi trường cần có: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN
"""

import os
import sys
import argparse

import requests

GRAPH_API_VERSION = "v21.0"  # đồng bộ với repo đăng ảnh, cho dễ nâng cấp cùng lúc sau này


def post_video(video_path, caption, dry_run=False):
    page_id = os.environ["FB_PAGE_ID"]
    access_token = os.environ["FB_PAGE_ACCESS_TOKEN"]

    if dry_run:
        print(f"[dry-run] Sẽ đăng video '{video_path}' với caption:\n{caption}")
        return None

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{page_id}/videos"
    with open(video_path, "rb") as f:
        resp = requests.post(
            url,
            data={"access_token": access_token, "description": caption},
            files={"source": f},
            timeout=900,  # video upload có thể mất vài phút tuỳ dung lượng/băng thông runner
        )

    if not resp.ok:
        # In nguyên văn lỗi trả về từ Facebook — thường nêu rõ lý do (quyền,
        # định dạng, kích thước...) hơn nhiều so với chỉ raise_for_status().
        print(f"[error] Facebook trả lỗi {resp.status_code}: {resp.text}", file=sys.stderr)
        resp.raise_for_status()

    data = resp.json()
    video_id = data.get("id")
    print(f"[ok] Đã đăng video, id: {video_id}")
    return video_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video_path")
    parser.add_argument("caption")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(args.video_path):
        print(f"[error] Không tìm thấy file video: {args.video_path}", file=sys.stderr)
        sys.exit(1)

    post_video(args.video_path, args.caption, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
