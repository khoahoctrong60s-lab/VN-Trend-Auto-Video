// validate.js — kiểm tra content.json trước khi render.
// Cách dùng: npm run validate [-- path/to/content.json]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Danh sách scene type có sẵn (đồng bộ với engine/scenes.js)
const KNOWN_TYPES = new Set([
  'title', 'bullets', 'bar-chart', 'line-chart',
  'number-counter', 'quote', 'comparison', 'outro',
]);

const WARN_LIMIT_TITLE = 60;   // ký tự
const WARN_DURATION_MAX = 90;  // giây

function validate(content, opts = {}) {
  const errors = [];
  const warnings = [];

  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return { errors: ['content phải là một JSON object'], warnings };
  }
  if (!content.meta || typeof content.meta !== 'object') {
    errors.push('Thiếu "meta" (title, format, fps, theme)');
  } else {
    if (!content.meta.title) errors.push('meta.title là bắt buộc');
    const formats = ['vertical', 'horizontal', 'square'];
    if (content.meta.format && !formats.includes(content.meta.format)) {
      errors.push('meta.format phải là một trong: ' + formats.join(', '));
    }
    if (content.meta.fps != null && (typeof content.meta.fps !== 'number' || content.meta.fps <= 0)) {
      errors.push('meta.fps phải là số dương');
    }
  }

  if (!Array.isArray(content.scenes) || content.scenes.length === 0) {
    errors.push('Thiếu "scenes" (mảng tối thiểu 1 scene)');
    return { errors, warnings };
  }

  let total = 0;
  content.scenes.forEach((scene, i) => {
    const label = 'scene ' + (i + 1);
    if (!scene || typeof scene !== 'object') {
      errors.push(label + ': phải là object');
      return;
    }
    if (!scene.type) {
      errors.push(label + ': thiếu "type"');
      return;
    }
    if (!KNOWN_TYPES.has(scene.type)) {
      errors.push(label + ': type "' + scene.type + '" chưa được hỗ trợ (đã có: ' +
        [...KNOWN_TYPES].join(', ') + ')');
      return;
    }
    if (!(typeof scene.duration === 'number' && scene.duration > 0)) {
      errors.push(label + ' (' + scene.type + '): "duration" phải là số > 0');
      return;
    }
    total += scene.duration;

    // validate() từng scene được khai báo trong engine/scenes/*.js (nếu chạy trong trình duyệt);
    // ở chế độ Node chỉ kiểm tra hợp lệ chung + cảnh báo.
    if (scene.type === 'title' && !scene.heading) {
      errors.push(label + ' (title): thiếu "heading"');
    }
    if (scene.type === 'bullets' && (!Array.isArray(scene.items) || !scene.items.length)) {
      errors.push(label + ' (bullets): thiếu "items"');
    }
    if ((scene.type === 'bar-chart' || scene.type === 'line-chart')) {
      if (!Array.isArray(scene.data) || scene.data.length === 0) {
        errors.push(label + ' (' + scene.type + '): thiếu "data"');
      } else {
        scene.data.forEach((d, j) => {
          if (typeof d.value !== 'number' || isNaN(d.value)) {
            errors.push(label + ' (' + scene.type + '): data[' + j + '].value phải là số');
          }
        });
      }
    }
    if (scene.type === 'line-chart' && Array.isArray(scene.data) && scene.data.length < 2) {
      errors.push(label + ' (line-chart): "data" cần tối thiểu 2 điểm');
    }
    if (scene.type === 'number-counter' && (typeof scene.value !== 'number' || isNaN(scene.value))) {
      errors.push(label + ' (number-counter): thiếu "value" (số)');
    }
    if (scene.type === 'quote' && !scene.text) {
      errors.push(label + ' (quote): thiếu "text"');
    }
    if (scene.type === 'comparison' &&
        (!scene.left || !Array.isArray(scene.left.items) || !scene.left.items.length ||
         !scene.right || !Array.isArray(scene.right.items) || !scene.right.items.length)) {
      errors.push(label + ' (comparison): cần left.items và right.items là mảng có nội dung');
    }
    if (scene.type === 'outro' && !scene.heading) {
      errors.push(label + ' (outro): thiếu "heading"');
    }

    // Cảnh báo (không dừng)
    if (scene.heading && String(scene.heading).length > WARN_LIMIT_TITLE) {
      warnings.push(label + ' (' + scene.type + '): heading dài quá ' + WARN_LIMIT_TITLE +
        ' ký tự — có thể bị chữ nhỏ');
    }
    if (scene.duration > 15) {
      warnings.push(label + ' (' + scene.type + '): duration > 15s — cân nhắc chia nhỏ scene');
    }
  });

  if (total > WARN_DURATION_MAX) {
    warnings.push('Tổng thời lượng video ' + total.toFixed(1) + 's > ' + WARN_DURATION_MAX +
      's — có thể quá dài cho video ngắn');
  }

  // Cảnh báo thiếu file asset (audio)
  if (content.audio && content.audio.music) {
    const musicPath = path.join(ROOT, content.audio.music);
    if (!fs.existsSync(musicPath)) {
      warnings.push('File nhạc nền không tồn tại: ' + content.audio.music);
    }
  }

  // Kiểm tra narration (lời đọc TTS) + audio block
  if (content.audio && content.audio.narration) {
    if (!content.audio.manifest) {
      errors.push('Khi dùng audio.narration phải khai báo audio.manifest (đường dẫn manifest.json)');
    }
    const voice = content.audio.narration.voice || 'vi-VN-HoaiMyNeural';
    // Provider vieneu dùng tên giọng mẫu tiếng Việt (vd "Thùy Dung"), edge dùng mã vi-*
    if (content.audio.narration.provider !== 'vieneu' && !/^vi-/.test(voice)) {
      warnings.push('Giọng TTS "' + voice + '" không phải mã vi-* của Edge Neural — kiểm tra lại');
    }
    content.scenes.forEach((scene, i) => {
      if (scene.narration && String(scene.narration).trim() && scene.duration < 3.5) {
        warnings.push('scene ' + (i + 1) + ' (' + scene.type + '): duration ' + scene.duration +
          's khá ngắn cho lời đọc — nên ≥ 3.5s để không bị cắt');
      }
      const f = path.join(ROOT, 'assets', 'audio', 'narration-' + String(i).padStart(2, '0') + '.mp3');
      if (scene.narration && String(scene.narration).trim() && !fs.existsSync(f)) {
        warnings.push('scene ' + (i + 1) + ': chưa có file lời đọc — chạy "npm run gen-audio"');
      }
    });
  }

  return { errors, warnings };
}

function validateFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(resolved)) {
    return { errors: ['Không tìm thấy file: ' + filePath], warnings: [] };
  }
  let content;
  try {
    content = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (e) {
    return { errors: ['JSON không hợp lệ: ' + e.message], warnings: [] };
  }
  const result = validate(content);
  return { ...result, content, resolved };
}

module.exports = { validate, validateFile, KNOWN_TYPES };

// Chạy trực tiếp: node scripts/validate.js [file.json]
if (require.main === module) {
  const arg = process.argv[2] || 'content/content.json';
  const result = validateFile(arg);
  if (result.warnings.length) {
    console.warn('CẢNH BÁO:');
    result.warnings.forEach((w) => console.warn('  ⚠ ' + w));
  }
  if (result.errors.length) {
    console.error('LỖI trong ' + arg + ':');
    result.errors.forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  const total = result.content.scenes.reduce((s, sc) => s + sc.duration, 0);
  console.log('✓ ' + arg + ' hợp lệ — ' + result.content.scenes.length + ' scene, ' +
    total.toFixed(1) + 's');
}
