// verify-video.js — xác minh nhanh file MP4 xuất ra: thời lượng, độ phân giải,
// và các khung lấy mẫu có nội dung thật (không phải nền trống).
// Cách dùng: node scripts/verify-video.js output/ten.mp4
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const checkEnvironment = require('./lib').checkEnvironment;

const SAMPLE_TIMES = [1.5, 4.2, 9.5, 14.2, 18.6, 20.8, 22.6, 25.7, 28.5, 32.4];

function run(bin, args, collectStdout) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: collectStdout ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'] });
    let out = collectStdout ? Buffer.alloc(0) : '';
    let err = '';
    if (collectStdout) p.stdout.on('data', (d) => { out = Buffer.concat([out, d]); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => reject(e));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('Dùng: node scripts/verify-video.js output/ten.mp4');
    process.exit(1);
  }
  const env = checkEnvironment();
  const ffmpeg = env.ffmpegPath;
  const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);

  // 1. Thông tin container
  const info = await run(ffmpeg, ['-i', file]);
  const durMatch = info.err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const resMatch = info.err.match(/,\s(\d{3,5})x(\d{3,5})[\s,]/);
  const vcodec = /Video: h264/.test(info.err) ? 'h264' : '?';
  const dur = durMatch ? (+durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3]).toFixed(2) : '?';
  const res = resMatch ? resMatch[1] + 'x' + resMatch[2] : '?';
  console.log('File: ' + file + ' — ' + sizeMB + ' MB');
  console.log('Thời lượng: ' + dur + 's | Độ phân giải: ' + res + ' | Codec: ' + vcodec);

  // 2. Lấy mẫu khung (thu nhỏ 270x480, gray) và đo pixel sáng
  let ok = true;
  for (const t of SAMPLE_TIMES) {
    const r = await run(ffmpeg,
      ['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=270:480',
       '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      true);
    if (r.code !== 0 || r.out.length < 270 * 480) {
      console.log('  t=' + t + 's — không đọc được khung');
      ok = false;
      continue;
    }
    let bright = 0, sum = 0;
    for (const b of r.out) { sum += b; if (b > 100) bright++; }
    const mean = (sum / r.out.length).toFixed(1);
    const hasContent = bright > 500; // >~1.5% pixel sáng hơn ngưỡng 100
    if (!hasContent) ok = false;
    console.log('  t=' + t + 's — luminance TB ' + mean + '/255, pixel sáng: ' +
      bright + ' (' + (100 * bright / r.out.length).toFixed(1) + '%) ' + (hasContent ? '✓ có nội dung' : '✗ nền trống?'));
  }
  console.log(ok ? '✓ Video có nội dung ở mọi khung lấy mẫu.' : '✗ Có khung trống — cần kiểm tra lại.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('Lỗi: ' + e.message); process.exit(1); });
