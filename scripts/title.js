// Scene "title": badge nhỏ + tiêu đề lớn (có từ nhấn màu accent) + phụ đề.
// Hiệu ứng: từng khối trượt lên và hiện dần theo p (0..1 của scene).
Engine.registerScene({
  type: 'title',
  defaults: {
    duration: 3,
    badge: '',
    heading: '',
    highlight: [],
    subheading: '',
  },

  validate: function (data) {
    var errors = [];
    if (!data.heading || typeof data.heading !== 'string') {
      errors.push('Thiếu trường "heading" (chuỗi)');
    }
    if (data.highlight && !Array.isArray(data.highlight)) {
      errors.push('Trường "highlight" phải là mảng chuỗi');
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var W = ctx.width, H = ctx.height, safe = ctx.safe;
    var th = ctx.theme;
    var e = ctx.easing;

    // Thời điểm hiện của từng khối (badge -> heading -> subheading)
    var t0 = 0.05, t1 = 0.22, t2 = 0.5;
    var dur = 0.28; // độ dài hiệu ứng mỗi khối (theo tiến độ scene)

    // --- Hạt sáng trôi nhẹ phía sau (vị trí làm tròn px → render deterministic) ---
    for (var pi = 0; pi < 14; pi++) {
      var pxx = ((pi * 97 + 40) % 100) / 100 * W;
      var drift = ((pi * 37) % 100) / 100 * H;
      var pyy = (((drift / H - t * 0.03 - pi * 0.013) % 1) + 1) % 1 * H;
      var psz = 6 + (pi % 3) * 5;
      var pdot = document.createElement('div');
      pdot.style.cssText =
        'position:absolute;left:' + Math.round(pxx) + 'px;top:' + Math.round(pyy) + 'px;' +
        'width:' + psz + 'px;height:' + psz + 'px;border-radius:50%;' +
        'background:' + (pi % 2 ? th.colors.accent1 : th.colors.accent2) + ';' +
        'opacity:' + (0.10 + 0.07 * Math.sin(t * 1.7 + pi)).toFixed(3) + ';';
      container.appendChild(pdot);
    }

    function blockProgress(start) {
      return e.clamp01((p - start) / dur);
    }

    // --- Badge ---
    var bp = blockProgress(t0);
    if (data.badge && bp > 0) {
      var badge = document.createElement('div');
      badge.textContent = data.badge;
      badge.style.cssText =
        'position:absolute;top:' + (H * 0.3 - (1 - e.easeOut(bp)) * 40) + 'px;left:0;right:0;' +
        'text-align:center;letter-spacing:0.35em;font-weight:700;' +
        'font-size:34px;color:' + th.colors.accent2 + ';opacity:' + bp + ';';
      container.appendChild(badge);
    }

    // --- Heading: tách từ, tô nhấn các từ trong highlight ---
    var hp = blockProgress(t1);
    if (hp > 0) {
      var headingSize = fitHeadingSize(data.heading, W, safe.width);
      var h = document.createElement('div');
      h.style.cssText =
        'position:absolute;top:' + (H * 0.42 - (1 - e.easeOut(hp)) * 60) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        "font-family:'" + (th.fonts.heading || th.fonts.body) + "',sans-serif;" +
        'font-weight:800;font-size:' + headingSize + 'px;line-height:1.15;' +
        'color:' + th.colors.text + ';opacity:' + hp + ';';
      h.innerHTML = highlightHeading(data.heading, data.highlight || [], th);
      container.appendChild(h);
    }

    // --- Subheading ---
    var sp = blockProgress(t2);
    if (data.subheading && sp > 0) {
      var sub = document.createElement('div');
      sub.textContent = data.subheading;
      sub.style.cssText =
        'position:absolute;top:' + (H * 0.58 - (1 - e.easeOut(sp)) * 40) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        'font-size:' + Math.round(ctx.theme.sizes.body * 0.9) + 'px;' +
        'color:' + th.colors.muted + ';opacity:' + sp + ';';
      container.appendChild(sub);
    }
  },
});

// Chọn cỡ chữ tiêu đề để không tràn khung (giảm dần đến khi vừa)
function fitHeadingSize(text, W, availW) {
  var size = 100;
  var maxCharsPerLine = Math.max(6, Math.floor(availW / (size * 0.52)));
  while (size > 44 && longestLine(text, maxCharsPerLine) > maxCharsPerLine) {
    size -= 6;
    maxCharsPerLine = Math.max(6, Math.floor(availW / (size * 0.52)));
  }
  return size;
}

// Ước lượng dòng dài nhất sau khi tự xuống dòng theo số ký tự tối đa
function longestLine(text, maxChars) {
  var words = String(text).split(/\s+/);
  var longest = 0, line = '';
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + ' ' + words[i] : words[i];
    if (test.length > maxChars && line) {
      longest = Math.max(longest, line.length);
      line = words[i];
    } else {
      line = test;
    }
  }
  longest = Math.max(longest, line.length);
  return longest;
}

// Bọc các từ nằm trong highlight bằng <span> màu accent1
function highlightHeading(text, highlights, theme) {
  var escaped = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var words = escaped.split(/(\s+)/); // giữ nguyên khoảng trắng
  // Phòng thủ: nếu "highlight" lỡ không phải mảng (thiếu, null, hoặc do nội
  // dung sinh tự động — Gemini/LLM khác — lỡ trả về chuỗi thay vì mảng), bỏ
  // qua tô màu thay vì crash cả video giữa chừng lúc render.
  var keys = (Array.isArray(highlights) ? highlights : []).map(function (k) { return String(k).toLowerCase(); });
  var out = words.map(function (w) {
    var bare = w.toLowerCase().replace(/[.,!?:;()"']/g, '');
    if (bare && keys.indexOf(bare) !== -1) {
      return '<span style="color:' + theme.colors.accent1 + '">' + w + '</span>';
    }
    return w;
  });
  return out.join('');
}
