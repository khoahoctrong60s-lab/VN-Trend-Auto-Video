// preview.js — mở server cục bộ để xem thử player trong trình duyệt.
// Cách dùng: npm run preview [-- content/examples/abc.json]
'use strict';
const { createStaticServer, findFreePort } = require('./lib');

(async () => {
  const port = await findFreePort(8788);
  const server = createStaticServer();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const content = process.argv[2] ? '?content=/' + process.argv[2].replace(/\\/g, '/').replace(/^\.\//, '') : '';
  console.log('');
  console.log('  Xem thử tại:  http://127.0.0.1:' + port + '/engine/player.html' + content);
  console.log('  (Ctrl+C để dừng)');
  console.log('');
})();
