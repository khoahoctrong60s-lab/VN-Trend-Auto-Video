// gen-audio.js — tạo toàn bộ audio cho video: giọng đọc (TTS neural tiếng Việt),
// nhạc nền (tổng hợp bằng FFmpeg), SFX (whoosh/pop/chime) và manifest thời gian.
// Cách dùng: node scripts/gen-audio.js [file.json] [--force]
// Kết quả trong assets/audio/: narration-XX.mp3, music.mp3, sfx-*.mp3, manifest.json
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ROOT, checkEnvironment } = require('./lib');
const { validateFile } = require('./validate');

// File content là tham số đầu tiên KHÔNG phải cờ (--force, --preview...)
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'content/content.json';
const FORCE = process.argv.includes('--force');
const audioDir = path.join(ROOT, 'assets', 'audio');

// ---- FFmpeg helper -----------------------------------------------------------
const ffmpegPath = checkEnvironment().ffmpegPath;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      .on('error', (e) => reject(new Error('Không chạy được FFmpeg: ' + e.message)))
      .on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg lỗi (mã ' + code + ')')));
  });
}

// Đọc thời lượng file audio bằng ffmpeg -i (không cần ffprobe riêng)
function audioDuration(file) {
  return new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(ffmpegPath, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => reject(e));
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) resolve(+m[1] * 3600 + +m[2] * 60 + +m[3]);
      else reject(new Error('Không đọc được thời lượng: ' + file));
    });
  });
}

// ---- Provider VieNeu-TTS (chạy cục bộ, CPU/ONNX, giọng mẫu tiếng Việt) ----------
// Cần venv: uv venv .venv-tts --python 3.12 && uv pip install --python .venv-tts/Scripts/python.exe vieneu
async function genWithVieneu(jobs, voiceName) {
  if (!jobs.length) return;
  const py = path.join(ROOT, '.venv-tts', 'Scripts', 'python.exe');
  const pyCmd = fs.existsSync(py) ? py : 'python';
  const bridge = path.join(__dirname, 'tts-vieneu.py');
  const jobFile = path.join(audioDir, '.vieneu-jobs.json');
  const jobList = jobs.map((j) => ({
    out: path.join(audioDir, j.mp3.replace(/\.mp3$/, '.wav')),
    text: j.text,
  }));
  fs.writeFileSync(jobFile, JSON.stringify(jobList, null, 2), 'utf8');
  console.log('  Chạy VieNeu-TTS cục bộ (giọng "' + voiceName + '", CPU)...');
  await new Promise((resolve, reject) => {
    const p = spawn(pyCmd, [bridge, '--voice', voiceName, '--jobs', jobFile],
      { stdio: 'inherit', env: Object.assign({}, process.env, { PYTHONUTF8: '1' }) });
    p.on('error', (e) => reject(new Error('Không chạy được Python/VieNeu: ' + e.message +
      ' — cài theo hướng dẫn trong README (mục Giọng đọc VieNeu)')));
    p.on('close', (code) => code === 0 ? resolve() :
      reject(new Error('VieNeu-TTS lỗi (mã ' + code + ')')));
  });
  // WAV 48kHz → MP3 44.1kHz để đồng bộ với pipeline trộn, xoá file tạm
  for (const j of jobList) {
    const mp3 = path.join(audioDir, path.basename(j.out).replace(/\.wav$/, '.mp3'));
    await ffmpeg(['-y', '-i', j.out, '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '4', mp3]);
    fs.rmSync(j.out, { force: true });
  }
  fs.rmSync(jobFile, { force: true });
}

// ---- TTS msedge-tts (giọng neural vi-VN qua mạng) -------------------------------
// Thử lại tối đa 3 lần vì websocket của dịch vụ thỉnh thoảng ngắt sớm.
const TTS_RETRIES = 3;

async function ttsToFile(mp3Path, text, voice, rate) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  for (let attempt = 1; attempt <= TTS_RETRIES; attempt++) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vte-tts-'));
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioFilePath } = await tts.toFile(tmpDir, text, { rate });
      fs.copyFileSync(audioFilePath, mp3Path);
      return;
    } catch (e) {
      if (attempt === TTS_RETRIES) {
        throw new Error('TTS thất bại sau ' + TTS_RETRIES + ' lần: ' + (e && e.message || e));
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

// ---- SFX + nhạc nền tổng hợp bằng FFmpeg ---------------------------------------
// Whoosh: nhiễu trắng lọc band-pass quét 400→2500Hz, envelope lên xuống 0.45s.
// Pop: sine 900→300Hz, decay nhanh 0.16s (tiếng "bụp" khi phần tử xuất hiện).
// Chime: 2 sine C6+E6 decay 0.8s (tiếng chuông nhẹ cho quote).

function sfxArgs(name) {
  switch (name) {
    case 'whoosh':
      return [
        '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.45:amplitude=0.55',
        '-af', 'bandpass=f=900:width_type=o:w=1.4,' +
          'afade=t=in:d=0.12,afade=t=out:st=0.2:d=0.25,volume=1.4',
      ];
    case 'pop':
      return [
        '-f', 'lavfi', '-i', 'sine=frequency=520:duration=0.16',
        '-af', 'afade=t=out:st=0.02:d=0.14,volume=1.5',
      ];
    case 'chime':
      return [
        '-f', 'lavfi', '-i', 'sine=frequency=1046.5:duration=0.8',
        '-f', 'lavfi', '-i', 'sine=frequency=1318.5:duration=0.8',
        '-filter_complex',
        '[0:a][1:a]amix=inputs=2:duration=longest,afade=t=out:st=0.1:d=0.7,volume=0.9',
      ];
    default:
      throw new Error('SFX không hỗ trợ: ' + name);
  }
}

async function genSfx(name) {
  const file = path.join(audioDir, 'sfx-' + name + '.mp3');
  if (!FORCE && fs.existsSync(file)) return file;
  await ffmpeg(['-y', ...sfxArgs(name), '-c:a', 'libmp3lame', '-q:a', '6', file]);
  return file;
}

// Nhạc nền: pad 4 hợp âm Am–F–C–G (quỹ đạo vòng bậc 5, vibe hi vọng),
// mỗi hợp âm gồm 3 lớp sine (gốc, quãng 5, bậc 3), đổi mỗi 2s.
// Cách làm: tạo từng đoạn 2s riêng rồi nối bằng concat demuxer — tránh biểu thức
// if() lồng sâu khiến FFmpeg crash.
async function buildMusic(total, outMp3, mv) {
  const CHORDS = [
    // [tần số gốc, quãng 5, bậc 3] — Am, F, C, G
    [220.0, 329.63, 261.63],
    [174.61, 261.63, 220.0],
    [130.81, 196.0, 164.81],
    [196.0, 293.66, 246.94],
  ];
  const segDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vte-music-'));
  try {
    const files = [];
    for (let i = 0; i < CHORDS.length; i++) {
      const c = CHORDS[i];
      // Envelope: attack ~0.25s, decay hết cuối đoạn (tránh click ở điểm nối)
      const expr = '(sin(2*PI*' + c[0] + '*t)*0.16+' +
        'sin(2*PI*' + c[1] + '*t)*0.10+' +
        'sin(2*PI*' + c[2] + '*t)*0.12)*exp(-3*mod(t,2))*min(t*4,1)';
      const f = path.join(segDir, 'chord-' + i + '.wav');
      // Bọc biểu thức trong nháy đơn: dấu phẩy trong mod(t,2) otherwise bị filtergraph
      // parser cắt nhầm thành filter riêng.
      await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=1:duration=2',
        '-af', "aeval='" + expr + "',aformat=sample_rates=44100:channel_layouts=mono", f]);
      files.push(f);
    }
    // Danh sách nối: lặp đủ khối 8s để phủ toàn bộ thời lượng
    const reps = Math.ceil(total / 8);
    const listFile = path.join(segDir, 'list.txt');
    let listTxt = '';
    for (let r = 0; r < reps; r++) {
      for (const f of files) listTxt += "file '" + f.replace(/\\/g, '/') + "'\n";
    }
    fs.writeFileSync(listFile, listTxt);
    const fade = mv.musicFadeOut > 0
      ? ',afade=t=out:st=' + Math.max(0, total - mv.musicFadeOut).toFixed(2) +
        ':d=' + mv.musicFadeOut.toFixed(2)
      : '';
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-t', total.toFixed(2),
      '-af', 'volume=' + (mv.musicVolume || 0.22) + fade,
      '-c:a', 'libmp3lame', '-q:a', '5', outMp3]);
  } finally {
    fs.rmSync(segDir, { recursive: true, force: true });
  }
}

// ---- Main ----------------------------------------------------------------------
async function main() {
  const validated = validateFile(fileArg);
  if (validated.errors.length) {
    validated.errors.forEach((e) => console.error('✗ ' + e));
    process.exit(1);
  }
  const content = validated.content;
  const total = content.scenes.reduce((s, sc) => s + sc.duration, 0);
  const narrationCfg = (content.audio && content.audio.narration) || {};
  const voice = narrationCfg.voice || 'vi-VN-HoaiMyNeural';
  const rate = narrationCfg.rate || '+0%';
  const delay = Number(narrationCfg.delay) || 0.3;

  fs.mkdirSync(audioDir, { recursive: true });

  // Tính thời điểm bắt đầu của từng scene (giống buildTimeline của engine)
  let t0 = 0;
  const manifest = { total, voice, entries: [] };
  let sfxUsed = new Set();

  // Quét các câu cần tạo (file thiếu hoặc --force)
  const jobs = [];
  content.scenes.forEach((sc, i) => {
    if (sc.narration && String(sc.narration).trim()) {
      const mp3 = 'narration-' + String(i).padStart(2, '0') + '.mp3';
      if (FORCE || !fs.existsSync(path.join(audioDir, mp3))) {
        jobs.push({ scene: i, mp3, text: String(sc.narration).trim() });
      }
    }
  });

  // Provider: 'edge' (msedge-tts, giọng vi-*) hoặc 'vieneu' (cục bộ, giọng mẫu Việt)
  const provider = narrationCfg.provider ||
    (voice && /^vi-/.test(voice) ? 'edge' : 'vieneu');
  console.log('Tạo giọng đọc — provider: ' + provider + ', voice: "' + voice + '"' +
    (provider === 'edge' && rate !== '+0%' ? ', rate ' + rate : '') +
    ' — ' + jobs.length + ' câu cần tạo');
  if (provider === 'vieneu') {
    await genWithVieneu(jobs, voice);
  } else {
    for (const j of jobs) {
      await ttsToFile(path.join(audioDir, j.mp3), j.text, voice, rate);
      console.log('  ✓ scene ' + (j.scene + 1));
    }
  }

  // Đo độ dài + cảnh báo nếu lời đọc vượt duration (áp dụng cho cả hai provider)
  for (let i = 0; i < content.scenes.length; i++) {
    const sc = content.scenes[i];
    const entry = { scene: i, type: sc.type, start: t0, duration: sc.duration };
    if (sc.narration && String(sc.narration).trim()) {
      const file = path.join(audioDir, 'narration-' + String(i).padStart(2, '0') + '.mp3');
      const dur = await audioDuration(file);
      if (delay + dur > sc.duration + 0.2) {
        console.warn('  ⚠ scene ' + (i + 1) + ' (' + sc.type + '): lời đọc ' +
          dur.toFixed(1) + 's (+delay ' + delay + 's) vượt duration ' + sc.duration + 's');
      }
      entry.file = 'narration-' + String(i).padStart(2, '0') + '.mp3';
      entry.narrStart = t0 + delay;
      entry.narrDur = dur;
      console.log('  ✓ scene ' + (i + 1) + ' (' + sc.type + '): ' + dur.toFixed(2) + 's');
    }
    manifest.entries.push(entry);
    t0 += sc.duration;
  }

  // Nhạc nền (luôn tạo lại vì phụ thuộc tổng thời lượng)
  console.log('Tổng hợp nhạc nền ' + total.toFixed(1) + 's...');
  const musicFile = path.join(audioDir, 'music.mp3');
  await buildMusic(total, musicFile, content.audio || {});
  manifest.music = 'music.mp3';

  // SFX theo LOẠI scene (không theo vị trí/index cố định) — content.json do
  // Gemini sinh có thể có 6-9 scene, thứ tự/số lượng mỗi loại không cố định
  // (vd 2 scene "bullets", không có "line-chart"...). Bản cũ hardcode đúng 8
  // scene theo 1 thứ tự duy nhất (title, bullets, bar-chart, line-chart,
  // number-counter, comparison, quote, outro) — "per(7, ...)" sẽ ra undefined
  // và crash ngay khi video có ÍT HƠN 8 scene hoặc khác thứ tự đó.
  const SFX_RULES = {
    'title': [{ name: 'whoosh', frac: 0.02 }],
    'bullets': [
      { name: 'pop', frac: 0.15 }, { name: 'pop', frac: 0.19 },
      { name: 'pop', frac: 0.32 }, { name: 'pop', frac: 0.45 },
    ],
    'bar-chart': [
      { name: 'pop', frac: 0.15 }, { name: 'whoosh', frac: 0.18 },
      { name: 'pop', frac: 0.38 }, { name: 'pop', frac: 0.58 },
    ],
    'line-chart': [
      { name: 'whoosh', frac: 0.12 }, { name: 'pop', frac: 0.28 },
      { name: 'pop', frac: 0.46 }, { name: 'pop', frac: 0.64 },
    ],
    'number-counter': [
      { name: 'whoosh', frac: 0.03 }, { name: 'chime', frac: 0.45 },
    ],
    'comparison': [
      { name: 'whoosh', frac: 0.1 }, { name: 'pop', frac: 0.18 },
      { name: 'pop', frac: 0.42 }, { name: 'pop', frac: 0.56 }, { name: 'pop', frac: 0.7 },
    ],
    'quote': [{ name: 'chime', frac: 0.08 }],
    'outro': [{ name: 'whoosh', frac: 0.03 }, { name: 'chime', frac: 0.35 }],
  };
  const SFX_PLAN = [];
  manifest.entries.forEach((e) => {
    const rules = SFX_RULES[e.type] || [];
    for (const r of rules) {
      SFX_PLAN.push({ name: r.name, at: e.start + e.duration * r.frac });
    }
  });
  console.log('Tạo SFX (' + SFX_PLAN.length + ' hiệu ứng)...');
  const sfxFiles = {};
  manifest.sfx = [];
  for (const s of SFX_PLAN) {
    if (!sfxFiles[s.name]) sfxFiles[s.name] = await genSfx(s.name);
    sfxUsed.add(s.name);
  }
  for (const s of SFX_PLAN) {
    manifest.sfx.push({
      file: path.basename(sfxFiles[s.name]),
      at: Math.max(0, s.at - 0.05), // SFX lên trước hiệu ứng hình ảnh một nhịp nhỏ
      volume: s.name === 'chime' ? 0.5 : (s.name === 'whoosh' ? 0.7 : 0.9),
    });
  }

  fs.writeFileSync(path.join(audioDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('✓ Đã tạo xong audio trong assets/audio/ (' +
    manifest.entries.filter((e) => e.file).length + ' lời đọc, ' +
    manifest.sfx.length + ' SFX, 1 nhạc nền) — manifest.json');
}

main().catch((e) => {
  console.error('\n✗ gen-audio thất bại: ' + (e && e.message || e));
  process.exit(1);
});
