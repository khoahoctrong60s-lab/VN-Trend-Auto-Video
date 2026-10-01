// Thư viện dùng chung cho các script Node: server tĩnh, kiểm tra môi trường.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Bản đồ MIME tối thiểu cho server tĩnh
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};

// Server tĩnh phục vụ player.html + assets (dùng cho preview và render)
function createStaticServer() {
  return http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/engine/player.html';
      // Chặn path traversal
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, buf) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found: ' + urlPath);
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store', // luôn lấy bản mới khi render lại
        });
        res.end(buf);
      });
    } catch (e) {
      res.writeHead(500);
      res.end('Server error');
    }
  });
}

// Tìm một port trống bắt đầu từ from
function findFreePort(from = 8765) {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(from, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(findFreePort(from + 1)));
  });
}

// Kiểm tra Node/FFmpeg trước khi render, báo lỗi dễ hiểu
function checkEnvironment() {
  const problems = [];
  const ffmpegPath = (() => {
    try {
      return require('ffmpeg-static');
    } catch {
      return null;
    }
  })();
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    process.env.FFMPEG_PATH = ffmpegPath;
  } else {
    problems.push(
      'Không tìm thấy FFmpeg. Cài đặt:\n' +
      '  - Windows: winget install Gyan.FFmpeg (hoặc tải tại ffmpeg.org)\n' +
      '  - macOS:   brew install ffmpeg\n' +
      '  - Linux:   sudo apt install ffmpeg\n' +
      '  Hoặc để dự án tự dùng gói ffmpeg-static (npm install ffmpeg-static).'
    );
  }
  return { ok: problems.length === 0, problems, ffmpegPath };
}

// Chờ tới khi điều kiện thỏa (poll mỗi 50ms, quá hạn thì báo lỗi).
// fn có thể trả về promise (ví dụ page.evaluate) — phải await kết quả,
// nếu không promise luôn truthy và hàm resolve quá sớm.
function waitFor(fn, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      Promise.resolve()
        .then(fn)
        .then((v) => {
          if (v) {
            clearInterval(timer);
            resolve(v);
          } else if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            reject(new Error('Quá thời gian chờ: ' + (label || 'điều kiện')));
          }
        })
        .catch((e) => {
          clearInterval(timer);
          reject(e);
        });
    }, 50);
  });
}

// In tiến độ một dòng (dùng \r để ghi đè)
function progress(text) {
  process.stdout.write('\r' + text.padEnd(70));
}

// Cờ Chrome hướng đến render deterministic: tắt GPU/raster phân số, ép profile màu
// sRGB, tắt subpixel font — cùng nội dung sẽ cho cùng ảnh bitmap ở mọi lần chạy.
const CHROME_ARGS = [
  '--disable-gpu',
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-font-subpixel-positioning',
  '--disable-skia-runtime-opts',
  '--run-all-compositor-stages-before-draw',
  '--disable-threaded-animation',
  '--disable-partial-raster',
];

module.exports = { ROOT, createStaticServer, findFreePort, checkEnvironment, waitFor, progress, CHROME_ARGS };
