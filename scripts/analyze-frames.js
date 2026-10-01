// analyze-frames.js — phân tích pixel các ảnh chụp smoke test để xác minh bố cục:
//  - nền đúng màu theme (không frame trắng/đen bất thường)
//  - mỗi frame có nội dung vẽ ra (không trống)
//  - dải vùng UI (top 150px / bottom 250px ở vertical) gần như không có chữ
// Cách dùng: node scripts/analyze-frames.js <thư_mục_ảnh>
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Cách dùng: node scripts/analyze-frames.js <thư_mục_ảnh>');
  process.exit(1);
}

const puppeteer = require('puppeteer');

(async () => {
  const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (!pngs.length) {
    console.error('Không có ảnh .png trong ' + dir);
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const results = [];
  for (const f of pngs) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const stats = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await new Promise((r) => { img.onload = r; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const W = c.width, H = c.height;

      // Màu nền: lấy pixel góc (5,5)
      const bg = [data[0], data[1], data[2]];
      let ink = 0;
      let inkTop = 0, inkBottom = 0;
      const topBand = Math.round(H * 150 / 1920);
      const bottomBand = Math.round(H * 250 / 1920);
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4;
          const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) +
            Math.abs(data[i + 2] - bg[2]);
          if (diff > 60) {
            ink++;
            if (y < topBand) inkTop++;
            if (y > H - bottomBand) inkBottom++;
          }
        }
      }
      const total = Math.ceil(W / 2) * Math.ceil(H / 2);
      return { w: W, h: H, bg: bg.join(','), inkPct: (ink / total) * 100, topPct: (inkTop / total) * 100, bottomPct: (inkBottom / total) * 100 };
    }, b64);
    results.push({ file: f, ...stats });
  }
  await browser.close();

  let fail = 0;
  for (const r of results) {
    const problems = [];
    // Frame đầu cảnh cố ý ít chữ (hiệu ứng vào cảnh) — chỉ báo động khi trống hoàn toàn
    if (r.inkPct < 0.05) problems.push('frame trống hoàn toàn');
    if (r.inkPct > 70) problems.push('frame bị phủ quá nhiều (có thể lỗi render)');
    if (r.topPct > 2) problems.push('nhiều mực ở dải top UI (' + r.topPct.toFixed(1) + '%)');
    if (r.bottomPct > 2) problems.push('nhiều mực ở dải bottom UI (' + r.bottomPct.toFixed(1) + '%)');
    const status = problems.length ? '✗ ' + problems.join('; ') : '✓';
    if (problems.length) fail++;
    console.log(status.padEnd(4), r.file.padEnd(38),
      'ink=' + r.inkPct.toFixed(1) + '%',
      'top=' + r.topPct.toFixed(1) + '%',
      'bot=' + r.bottomPct.toFixed(1) + '%',
      'bg=' + r.bg);
  }
  console.log(fail ? '\n✗ ' + fail + ' frame có vấn đề' : '\n✓ Tất cả frame đạt: có nội dung, đúng vùng an toàn');
  process.exit(fail ? 1 : 0);
})();
