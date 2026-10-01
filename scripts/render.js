// render.js — mở player.html?render=1, chụp từng khung, ghép MP4 bằng FFmpeg.
// Cách dùng:
//   npm run render                              # content/content.json
//   npm run render -- content/examples/abc.json # file khác
//   npm run render -- --preview                 # nhanh 15fps, nửa độ phân giải
//   npm run render -- --keep-frames --workers 4 # giữ khung tạm / chụp song song
//   npm run render -- --jpeg                    # chụp JPEG (nhanh hơn PNG, chất lượng 95)
//   npm run render -- --out output/ten.mp4
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ROOT, createStaticServer, findFreePort, checkEnvironment, waitFor, progress, CHROME_ARGS } =
  require('./lib');
const { validateFile } = require('./validate');

// ---- Tham số dòng lệnh -------------------------------------------------------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') args.preview = true;
    else if (a === '--keep-frames') args.keepFrames = true;
    else if (a === '--jpeg') args.jpeg = true;
    else if (a === '--workers') args.workers = Number(argv[++i]) || 1;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

function slugify(title) {
  // Chuyển tiêu đề thành tên file an toàn (giữ chữ tiếng Việt, bỏ ký tự đặc biệt)
  return String(title)
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Cách dùng: npm run render -- [file.json] [--preview] [--keep-frames] [--workers N] [--out output/x.mp4]');
    return;
  }

  // 1. Kiểm tra môi trường
  const env = checkEnvironment();
  if (!env.ok) {
    env.problems.forEach((p) => console.error(p));
    process.exit(1);
  }

  // 2. Validate content
  const contentPath = args._[0] || 'content/content.json';
  const validated = validateFile(contentPath);
  if (validated.warnings.length) {
    validated.warnings.forEach((w) => console.warn('⚠ ' + w));
  }
  if (validated.errors.length) {
    console.error('Render dừng do lỗi trong ' + contentPath + ':');
    validated.errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  const content = validated.content;
  console.log('✓ Content hợp lệ: ' + content.meta.title +
    ' (' + content.meta.format + ', ' + content.scenes.length + ' scene)');

  // 3. Khởi động server tĩnh cục bộ
  const port = await findFreePort(8765);
  const server = createStaticServer();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  const preview = !!args.preview;
  const fps = preview ? 15 : (Number(content.meta.fps) || 30);
  const scale = preview ? 0.5 : 1;

  // 4. Mở Puppeteer
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300000, // 5 phút cho 1 lệnh CDP (tránh timeout khi máy bận)
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...CHROME_ARGS],
  });

  const framesDir = path.join(os.tmpdir(), 'vte-frames-' + Date.now());
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    const total = content.scenes.reduce((s, sc) => s + sc.duration, 0);
    const nFrames = Math.max(1, Math.round(total * fps));
    console.log('Độ dài video: ' + total.toFixed(2) + 's — ' + nFrames + ' khung @' + fps + 'fps');

    // Truyền content qua query param (đường dẫn trên server tĩnh)
    const relPath = path.relative(ROOT, path.resolve(ROOT, contentPath)).replace(/\\/g, '/');
    const url = 'http://127.0.0.1:' + port + '/engine/player.html?render=1&content=/' + relPath +
      (preview ? '&preview=1' : '');

    // Chụp song song bằng nhiều tab/workers (mặc định 1 = tuần tự, ổn định nhất;
    // máy yếu có thể timeout nếu mở quá nhiều tab full-res)
    const workers = Math.max(1, Math.min(args.workers || 1, 8));
    const chunk = Math.ceil(nFrames / workers);

    // Bọc lệnh CDP với timeout ngắn — nếu Chrome treo một lệnh thì báo lỗi ngay
    // thay vì chờ protocolTimeout 5 phút.
    const withTimeout = (p, ms, label) =>
      Promise.race([p, new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Timeout ' + label + ' sau ' + ms + 'ms')), ms))]);

    // Mở trang + chờ engine sẵn sàng. Dùng lại được khi khung bị treo:
    // mọi khung đều vẽ lại được từ setTime(t) nên nạp lại trang không ảnh hưởng kết quả.
    const makePage = async () => {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      await waitFor(() => page.evaluate('window.READY === true'), 30000, 'window.READY');
      const bootErr = await page.evaluate('window.BOOT_ERROR || null');
      if (bootErr) throw new Error('Engine boot lỗi: ' + bootErr);
      const dims = await page.evaluate('({WIDTH: window.WIDTH, HEIGHT: window.HEIGHT, FPS: window.FPS, DURATION: window.DURATION})');
      // Viewport đúng kích thước video (nhân scale khi --preview);
      // engine tự scale sân khấu theo sự kiện resize
      await page.setViewport({
        width: Math.round(dims.WIDTH * scale),
        height: Math.round(dims.HEIGHT * scale),
      });
      return { page, dims };
    };

    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      // So le khởi động worker để giảm tranh chấp CPU khi nạp font/timeline
      await new Promise((r) => setTimeout(r, w * 300));
      let { page, dims } = await makePage();
      if (w === 0) {
        console.log('Khung: ' + dims.WIDTH + 'x' + dims.HEIGHT + ' @' + dims.FPS + 'fps — tổng ' +
          dims.DURATION.toFixed(2) + 's');
      }

      // Vòng lặp khung của worker này
      const ext = args.jpeg ? 'jpg' : 'png';
      const from = w * chunk;
      const to = Math.min(nFrames, from + chunk);
      for (let i = from; i < to; i++) {
        const t = i / fps;
        const file = path.join(framesDir, 'frame_' + String(i).padStart(5, '0') + '.' + ext);
        // Tối đa 3 lần thử cho một khung: giữa các lần thử tạo lại trang vì
        // lệnh CDP treo thường do renderer bị kẹt chứ không phải do nội dung.
        let done = false, lastErr = null;
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          if (attempt > 0) {
            progress('Khung ' + i + ' treo — tạo lại trang (lần ' + attempt + '/2)...');
            try { await page.close(); } catch (_) { /* bỏ qua */ }
            ({ page } = await withTimeout(makePage(), 120000, 'tạo lại trang'));
          }
          try {
            await withTimeout(page.evaluate('window.setTime(' + t + ')'), 20000, 'setTime(' + t + ')');
            await withTimeout(
              page.screenshot(
                args.jpeg
                  ? { path: file, type: 'jpeg', quality: 95 } // JPEG nhanh hơn nhiều, đủ cho video
                  : { path: file, omitBackground: false }
              ),
              45000, 'chụp khung ' + i);
            done = true;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!done) throw lastErr;
        if (w === 0 || (i % 30 === 0)) {
          const doneF = Math.min(i + 1, nFrames);
          progress('Chụp khung ' + doneF + '/' + nFrames + ' (' +
            Math.round((doneF / nFrames) * 100) + '%)');
        }
      }
      await page.close();
    }));
    progress('Chụp xong ' + nFrames + ' khung\n');

    // 5. Ghép video bằng FFmpeg
    const outDir = path.join(ROOT, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.isAbsolute(args.out || '')
      ? args.out
      : path.join(ROOT, args.out || path.join('output', slugify(content.meta.title) + '.mp4'));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const ffmpeg = env.ffmpegPath;
    const ffArgs = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%05d.' + (args.jpeg ? 'jpg' : 'png')),
    ];

    // ---- Audio: tự tạo nếu thiếu, rồi trộn nhạc nền + lời đọc + SFX ---------------
    const audioCfg = content.audio || {};
    const audioDir = path.join(ROOT, 'assets', 'audio');
    const manifestFile = path.join(audioDir, 'manifest.json');
    if ((audioCfg.music || audioCfg.narration) && !fs.existsSync(manifestFile)) {
      console.log('Chưa có audio — chạy gen-audio để tạo (TTS cần mạng)...');
      await new Promise((resolve, reject) => {
        const p = spawn(process.execPath,
          [path.join(__dirname, 'gen-audio.js'), contentPath], { stdio: 'inherit' });
        p.on('error', reject);
        p.on('close', (code) => code === 0 ? resolve() :
          reject(new Error('gen-audio lỗi (mã ' + code + ') — chạy lại hoặc bỏ khối audio trong content')));
      });
    }

    let hasAudioTrack = false;
    if (fs.existsSync(manifestFile) && fs.existsSync(path.join(audioDir, 'music.mp3')) &&
        audioCfg.music !== false) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const mv = audioCfg.musicVolume != null ? audioCfg.musicVolume : 0.18;
      const fadeOut = audioCfg.musicFadeOut != null ? audioCfg.musicFadeOut : 2.5;

      // Trộn 2 GIAI ĐOẠN để tránh lỗi amix im lặng giữa chừng khi hàng chục luồng
      // adelay đi cùng input khung hình: (1) trộn lời đọc + SFX thành 1 track,
      // (2) ghép video + nhạc + track đó bằng amix 2 luồng.
      const overDub = path.join(framesDir, 'overdub.wav');
      const p1Args = ['-y'];
      const p1Parts = [], p1Labels = [];
      let ai = 0;
      (manifest.entries || []).forEach((e) => {
        if (!e.file) return;
        p1Args.push('-i', path.join(audioDir, e.file));
        const at = Math.max(0, Math.round((e.narrStart != null ? e.narrStart : e.start) * 1000));
        p1Parts.push('[' + ai + ':a]aresample=44100,aformat=channel_layouts=mono,' +
          'adelay=' + at + '|' + at + '[a' + ai + ']');
        p1Labels.push('[a' + ai + ']');
        ai++;
      });
      (manifest.sfx || []).forEach((s) => {
        p1Args.push('-i', path.join(audioDir, s.file));
        const at = Math.max(0, Math.round((s.at || 0) * 1000));
        p1Parts.push('[' + ai + ':a]aresample=44100,aformat=channel_layouts=mono,' +
          'adelay=' + at + '|' + at + ',volume=' + (s.volume != null ? s.volume : 0.8) +
          '[a' + ai + ']');
        p1Labels.push('[a' + ai + ']');
        ai++;
      });
      if (ai > 0) {
        p1Args.push('-filter_complex',
          p1Parts.join(';') + ';' + p1Labels.join('') +
          'amix=inputs=' + p1Labels.length + ':duration=longest:normalize=0,' +
          'apad=whole_dur=' + total.toFixed(3) +
          ',aformat=sample_rates=44100:channel_layouts=mono[aout]',
          '-map', '[aout]', '-t', String(total), overDub);
        console.log('Trộn lời đọc + SFX (' + p1Labels.length + ' luồng)...');
        await runFfmpeg(ffmpeg, p1Args);
      }

      // Giai đoạn 2: video + nhạc nền + overdub → track cuối
      ffArgs.push('-stream_loop', '-1', '-i', path.join(audioDir, 'music.mp3'));
      if (ai > 0) ffArgs.push('-i', overDub);
      const musicFilter = '[1:a]aresample=44100,aformat=channel_layouts=mono,' +
        'atrim=0:' + total.toFixed(3) + ',volume=' + mv +
        (fadeOut > 0 ? ',afade=t=out:st=' + Math.max(0, total - fadeOut).toFixed(2) +
          ':d=' + fadeOut.toFixed(2) : '');
      if (ai > 0) {
        ffArgs.push('-filter_complex',
          musicFilter + '[m0]' +
          ';[2:a]atrim=0:' + total.toFixed(3) + '[o0]' +
          ';[m0][o0]amix=inputs=2:duration=first:normalize=0,' +
          'aformat=sample_rates=44100:channel_layouts=mono[aout]',
          '-map', '0:v', '-map', '[aout]');
      } else {
        ffArgs.push('-filter_complex', musicFilter + '[aout]',
          '-map', '0:v', '-map', '[aout]');
      }
      hasAudioTrack = true;
    }

    ffArgs.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '18',
      '-preset', 'medium',
      '-movflags', '+faststart',
      ...(hasAudioTrack ? ['-c:a', 'aac', '-b:a', '192k', '-t', String(total)] : []),
      outPath
    );

    console.log('Đang ghép video bằng FFmpeg...');
    await runFfmpeg(ffmpeg, ffArgs).catch((e) => {
      // Lưu lại toàn bộ tham số để dễ debug khi FFmpeg từ chối filter_complex
      try { fs.writeFileSync(path.join(outDir, 'ffmpeg-fail-args.json'),
        JSON.stringify(ffArgs, null, 2)); } catch (_) { /* bỏ qua */ }
      throw e;
    });

    const size = fs.statSync(outPath).size;
    console.log('✓ Xuất video: ' + path.relative(ROOT, outPath) +
      ' (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
  } finally {
    await browser.close();
    server.close();
    // 6. Dọn khung tạm (giữ nếu --keep-frames)
    if (!args.keepFrames) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    } else {
      console.log('Giữ khung hình tại: ' + framesDir);
    }
  }
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => reject(new Error('Không chạy được FFmpeg: ' + e.message)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('FFmpeg thoát với mã ' + code + '\n' + err.slice(-1200)));
    });
  });
}

main().catch((e) => {
  console.error('\n✗ Render thất bại: ' + e.message);
  process.exit(1);
});
