// Scene "quote": câu trích hiện dần (theo khối từ), gạch nhấn, tên nguồn hiện sau.
Engine.registerScene({
  type: 'quote',
  defaults: {
    duration: 4,
    text: '',
    source: '',
  },

  validate: function (data) {
    var errors = [];
    if (!data.text || typeof data.text !== 'string') {
      errors.push('Thiếu trường "text" (chuỗi)');
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;
    var safe = ctx.safe;

    // Dấu ngoặc kép lớn trang trí
    var mark = document.createElement('div');
    var mp = e.clamp01(p / 0.15);
    mark.style.cssText =
      'position:absolute;top:' + (safe.top + 20 - (1 - e.easeOut(mp)) * 30) + 'px;' +
      'left:' + (safe.cx - 70) + 'px;font-size:220px;line-height:1;font-weight:800;' +
      'color:' + th.colors.accent2 + ';opacity:' + 0.35 * mp + ';font-family:Georgia,serif;';
    mark.textContent = '\u201C';
    container.appendChild(mark);

    // --- Câu trích: các từ hiện dần theo tiến độ ---
    var words = String(data.text).split(/\s+/);
    var startAt = 0.1;
    var span = 0.55; // dải tiến độ để toàn bộ câu hiện xong
    var per = span / Math.max(1, words.length);

    var quote = document.createElement('div');
    quote.style.cssText =
      'position:absolute;top:' + ctx.height * 0.38 + 'px;' +
      'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
      'font-weight:700;font-size:' + th.sizes.h2 + 'px;line-height:1.4;color:' + th.colors.text + ';';

    var html = words.map(function (w, i) {
      var wp = e.clamp01((p - startAt - i * per) / (per * 0.8));
      if (wp <= 0) return '&nbsp;';
      var op = Math.max(0.12, wp);                       // giữ nhẹ vị trí đã hiện
      var dy = (1 - e.easeOut(wp)) * 12;                 // trượt lên nhẹ
      return '<span style="display:inline-block;opacity:' + op + ';transform:translateY(' +
        dy.toFixed(1) + 'px);">' + w + '</span>';
    }).join(' ');
    quote.innerHTML = html;
    container.appendChild(quote);

    // --- Gạch nhấn giữa quote và nguồn ---
    var lp = e.clamp01((p - 0.68) / 0.15);
    if (lp > 0) {
      var line = document.createElement('div');
      line.style.cssText =
        'position:absolute;top:' + ctx.height * 0.62 + 'px;' +
        'left:' + (safe.cx - 90 * lp) + 'px;width:' + (180 * lp) + 'px;height:5px;' +
        'border-radius:3px;background:' + th.colors.accent1 + ';';
      container.appendChild(line);
    }

    // --- Nguồn ---
    var sp = e.clamp01((p - 0.75) / 0.2);
    if (data.source && sp > 0) {
      var src = document.createElement('div');
      src.style.cssText =
        'position:absolute;top:' + (ctx.height * 0.66 - (1 - e.easeOut(sp)) * 20) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        'font-size:' + th.sizes.caption + 'px;letter-spacing:0.08em;color:' +
        th.colors.muted + ';opacity:' + sp + ';';
      src.textContent = '— ' + data.source;
      container.appendChild(src);
    }
  },
});
