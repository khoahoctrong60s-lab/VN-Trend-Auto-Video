// smoke-test.js — kiểm tra player thực tế: nạp, bắt lỗi JS, chụp ảnh từng scene.
// Cách dùng: node scripts/smoke-test.js [content.json] [thư_mục_ảnh_ra]
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ROOT, createStaticServer, findFreePort, waitFor } = require('./lib');

(async () => {
  const contentPath = process.argv[2] || 'content/content.json';
  const outDir = process.argv[3] || path.join(os.tmpdir(), 'vte-smoke');
  fs.mkdirSync(outDir, { recursive: true });

  const port = await findFreePort(8765);
  const server = createStaticServer();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 540, height: 960 }); // xem thử nửa kích thước vertical

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('[console] ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));

  const rel = path.relative(ROOT, path.resolve(ROOT, contentPath)).replace(/\\/g, '/');
  const url = 'http://127.0.0.1:' + port + '/engine/player.html?render=1&content=/' + rel;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await waitFor(() => page.evaluate('window.READY === true'), 30000, 'window.READY');

  const bootErr = await page.evaluate('window.BOOT_ERROR || null');
  if (bootErr) errors.push('[boot] ' + bootErr);

  const meta = await page.evaluate(
    '({WIDTH: WIDTH, HEIGHT: HEIGHT, FPS: FPS, DURATION: DURATION})'
  );
  console.log('Engine:', JSON.stringify(meta));

  // Duyệt từng scene: chụp 3 mốc (10%, 55%, 90% scene)
  const timeline = await page.evaluate(
    'Engine.state.scenes.map(s => ({type: s.def.type, start: s.start, duration: s.duration}))'
  );
  let shot = 0;
  for (const sc of timeline) {
    for (const frac of [0.1, 0.55, 0.9]) {
      const t = sc.start + sc.duration * frac;
      await page.evaluate('setTime(' + t + ')');
      await new Promise((r) => setTimeout(r, 30)); // đợi paint
      shot++;
      const file = path.join(outDir,
        'scene' + String(timeline.indexOf(sc) + 1) + '-' + sc.type + '-' + Math.round(frac * 100) + '.png');
      await page.screenshot({ path: file });
      console.log('📸 ' + path.relative(ROOT, file) + ' @ t=' + t.toFixed(2) + 's');
    }
  }

  // Kiểm tra deterministic: gọi setTime cùng một t hai lần, DOM phải giống nhau
  await page.evaluate('setTime(3.1); window.__a = document.getElementById("video-container").innerHTML;');
  await page.evaluate('setTime(7.0); setTime(3.1); window.__b = document.getElementById("video-container").innerHTML;');
  const same = await page.evaluate('window.__a === window.__b');
  console.log(same ? '✓ Deterministic: setTime(3.1) hai lần cho DOM giống nhau' :
    '✗ KHÔNG deterministic: DOM khác nhau giữa hai lần gọi setTime');

  await browser.close();
  server.close();

  if (errors.length) {
    console.error('\n✗ Phát hiện lỗi:');
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }
  console.log('\n✓ Smoke test passed: không có lỗi JS, ' + shot + ' ảnh chụp tại ' + outDir);
})().catch((e) => {
  console.error('✗ Smoke test thất bại: ' + e.message);
  process.exit(1);
});
