// render-all.js — render tất cả file .json trong content/ (hoặc thư mục chỉ định).
// Cách dùng: npm run render:all [-- content/examples]
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib');

const targetDir = process.argv[2] || 'content';
const abs = path.isAbsolute(targetDir) ? targetDir : path.join(ROOT, targetDir);

const files = fs.readdirSync(abs)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.join(abs, f));

if (!files.length) {
  console.error('Không tìm thấy file .json nào trong ' + targetDir);
  process.exit(1);
}

console.log('Sẽ render ' + files.length + ' file:');
files.forEach((f) => console.log('  - ' + path.relative(ROOT, f)));

// Chạy tuần tự render.js cho từng file để tránh tranh chấp CPU/FFmpeg
const { spawnSync } = require('child_process');
let failed = 0;
for (const f of files) {
  console.log('\n=== Render: ' + path.relative(ROOT, f) + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'render.js'), f], {
    stdio: 'inherit',
  });
  if (r.status !== 0) failed++;
}

if (failed) {
  console.error('\n✗ ' + failed + '/' + files.length + ' file render thất bại');
  process.exit(1);
}
console.log('\n✓ Đã render thành công ' + files.length + '/' + files.length + ' file');
