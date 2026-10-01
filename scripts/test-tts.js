// test-tts.js — thử msedge-tts tạo giọng đọc tiếng Việt, lưu file MP3 để kiểm tra.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEXT = 'Xin chào! Đây là thử nghiệm giọng đọc tiếng Việt cho video quy tắc 50 30 20.';
const OUT = path.join('assets', 'audio', 'test-tts.mp3');

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('vi-VN-HoaiMyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // toFile(dir, text) ghi file vào trong thư mục và trả về đường dẫn file đã ghi.
  // Copy (không rename) vì tmpdir có thể khác ổ đĩa với dự án (EXDEV).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-test-'));
  const { audioFilePath } = await tts.toFile(tmpDir, TEXT);
  fs.copyFileSync(audioFilePath, path.resolve(OUT));
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const size = fs.statSync(OUT).size;
  console.log('✓ Đã tạo ' + OUT + ' (' + size + ' bytes)');
  if (size < 1000) throw new Error('File quá nhỏ — có thể lỗi âm thầm');
}

main().catch((e) => {
  console.error('✗ TTS thất bại: ' + (e && e.message || e));
  process.exit(1);
});
