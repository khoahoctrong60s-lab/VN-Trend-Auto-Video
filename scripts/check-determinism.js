// check-determinism.js — kiểm tra nhanh tính deterministic của engine + Chrome.
// Chụp các khung thử ở nhiều thời điểm, lặp lại trong cùng trình duyệt (tab mới)
// và qua một trình duyệt khởi động lại, rồi so sánh từng byte ảnh chụp.
// Cách dùng: node scripts/check-determinism.js [file.json]
'use strict';
const { ROOT, createStaticServer, findFreePort, waitFor, CHROME_ARGS } = require('./lib');
const { validateFile } = require('./validate');

// Các thời điểm kiểm tra — phủ đủ 8 scene (kể cả vùng từng bị lệch: 18.5–23.2s)
const TIMES = [1.5, 4.2, 9.5, 11.3, 14.2, 16.9, 18.6, 19.4, 20.8, 22.6, 23.4, 25.7, 28.5, 32.4, 33.6];

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) =>
    setTimeout(() => rej(new Error('Timeout ' + label + ' sau ' + ms + 'ms')), ms))]);

// Chụp 1 khung với tự phục hồi: lệnh CDP treo (lỗi flaky của Chrome) thì tạo lại
// trang và chụp lại — an toàn vì engine vẽ lại mọi khung từ setTime(t).
async function captureSet(browser, url, tag) {
  const makePage = async () => {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await waitFor(() => page.evaluate('window.READY === true'), 30000, 'window.READY');
    const bootErr = await page.evaluate('window.BOOT_ERROR || null');
    if (bootErr) throw new Error('Engine boot lỗi (' + tag + '): ' + bootErr);
    const dims = await page.evaluate('({WIDTH: window.WIDTH, HEIGHT: window.HEIGHT})');
    await page.setViewport({ width: dims.WIDTH, height: dims.HEIGHT });
    return page;
  };

  let page = await makePage();
  const shots = [];
  for (const t of TIMES) {
    let buf = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && !buf; attempt++) {
      try {
        if (attempt > 0) {
          try { await page.close(); } catch (_) { /* bỏ qua */ }
          page = await withTimeout(makePage(), 120000, 'tạo lại trang');
        }
        await withTimeout(page.evaluate('window.setTime(' + t + ')'), 20000, 'setTime');
        buf = await withTimeout(
          page.screenshot({ type: 'jpeg', quality: 95, omitBackground: false }),
          45000, 'chụp khung t=' + t);
      } catch (e) {
        lastErr = e;
      }
    }
    if (!buf) throw lastErr;
    shots.push(buf);
  }
  await page.close();
  console.log('  ' + tag + ': đã chụp ' + shots.length + ' khung thử');
  return shots;
}

async function main() {
  const contentPath = process.argv[2] || 'content/content.json';
  const validated = validateFile(contentPath);
  if (validated.errors.length) {
    validated.errors.forEach((e) => console.error('✗ ' + e));
    process.exit(1);
  }

  const port = await findFreePort(8765);
  const server = createStaticServer();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  const relPath = path.relative(ROOT, path.resolve(ROOT, contentPath)).replace(/\\/g, '/');
  const url = 'http://127.0.0.1:' + port + '/engine/player.html?render=1&content=/' + relPath;

  const puppeteer = require('puppeteer');
  const launchOpts = {
    headless: true,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...CHROME_ARGS],
  };

  console.log('Kiểm tra deterministic với ' + TIMES.length + ' khung thử:');
  const browser1 = await puppeteer.launch(launchOpts);
  const setA = await captureSet(browser1, url, 'Lần 1 (trình duyệt 1)');
  const setB = await captureSet(browser1, url, 'Lần 2 (tab mới, cùng trình duyệt)');
  await browser1.close();

  const browser2 = await puppeteer.launch(launchOpts);
  const setC = await captureSet(browser2, url, 'Lần 3 (trình duyệt khởi động lại)');
  await browser2.close();
  server.close();

  let ok = true;
  for (let i = 0; i < TIMES.length; i++) {
    const sameTab = setA[i].equals(setB[i]);
    const sameBrowser = setA[i].equals(setC[i]);
    if (!sameTab || !sameBrowser) {
      ok = false;
      console.log('  ✗ t=' + TIMES[i] + 's — tab mới: ' + (sameTab ? 'khớp' : 'LỆCH') +
        ', trình duyệt mới: ' + (sameBrowser ? 'khớp' : 'LỆCH'));
    }
  }
  if (ok) {
    console.log('✓ Deterministic: ' + TIMES.length + '/' + TIMES.length + ' khung giống hệt nhau (so từng byte).');
  } else {
    console.log('✗ Có khung khác nhau giữa các lần chụp — xem chi tiết ở trên.');
    process.exit(1);
  }
}

const path = require('path');
main().catch((e) => {
  console.error('\n✗ Kiểm tra thất bại: ' + e.message);
  process.exit(1);
});
