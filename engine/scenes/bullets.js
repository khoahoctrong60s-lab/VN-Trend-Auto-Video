// Scene "bullets": tiêu đề + danh sách gạch đầu dòng hiện lần lượt, giãn cách đều.
Engine.registerScene({
  type: 'bullets',
  defaults: {
    duration: 5,
    heading: '',
    items: [],
  },

  validate: function (data) {
    var errors = [];
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.push('Thiếu trường "items" (mảng chuỗi, tối thiểu 1 phần tử)');
    } else {
      data.items.forEach(function (it, i) {
        if (typeof it !== 'string' || !it.trim()) {
          errors.push('items[' + i + '] phải là chuỗi không rỗng');
        }
      });
      if (data.items.length > 6) {
        errors.push('items nên có tối đa 6 phần tử để không tràn khung');
      }
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;
    var safe = ctx.safe;
    var W = ctx.width;

    // --- Tiêu đề ---
    var hp = e.clamp01(p / 0.2);
    if (data.heading) {
      var h = document.createElement('div');
      h.style.cssText =
        'position:absolute;top:' + (safe.top + 40 - (1 - e.easeOut(hp)) * 50) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        'font-weight:800;font-size:' + th.sizes.h2 + 'px;line-height:1.2;' +
        'color:' + th.colors.text + ';opacity:' + hp + ';';
      h.textContent = data.heading;
      container.appendChild(h);
    }

    // --- Danh sách items, giãn cách đều theo thời lượng ---
    var items = data.items || [];
    var n = items.length;
    if (!n) return;
    var listTop = safe.top + 280;
    var listH = ctx.height - listTop - safe.bottom - 100;
    var rowH = Math.min(190, Math.floor(listH / Math.max(1, n)));

    var startAt = 0.15;                      // bắt đầu sau khi heading hiện
    var span = Math.max(0.3, 0.75 - 0);      // dải tiến độ dùng để lần lượt hiện
    var per = span / n;

    for (var i = 0; i < n; i++) {
      var ip = e.clamp01((p - startAt - i * per) / (per * 0.6));
      if (ip <= 0) continue;
      var ep = e.easeOut(ip);

      var row = document.createElement('div');
      row.style.cssText =
        'position:absolute;left:' + (safe.left + 60) + 'px;width:' + (safe.width - 120) + 'px;' +
        'top:' + (listTop + i * rowH + (1 - ep) * 40) + 'px;' +
        'display:flex;align-items:center;gap:28px;opacity:' + ip + ';';

      // Chấm tròn màu accent luân phiên
      var dot = document.createElement('div');
      var accent = [th.colors.accent1, th.colors.accent2, th.colors.accent3][i % 3];
      dot.style.cssText =
        'width:' + Math.max(0, ep * 22) + 'px;height:' + Math.max(0, ep * 22) + 'px;' +
        'border-radius:50%;background:' + accent + ';flex:0 0 auto;';
      row.appendChild(dot);

      var txt = document.createElement('div');
      txt.style.cssText =
        'font-size:' + th.sizes.body + 'px;line-height:1.35;font-weight:500;' +
        'color:' + th.colors.text + ';';
      txt.textContent = items[i];
      row.appendChild(txt);

      container.appendChild(row);
    }

    // Đường kẻ trang trí dưới danh sách (hiện dần cuối scene)
    if (p > 0.8) {
      var lp = e.clamp01((p - 0.8) / 0.2);
      var line = document.createElement('div');
      line.style.cssText =
        'position:absolute;bottom:' + (safe.bottom + 60) + 'px;' +
        'left:' + (safe.cx - safe.width * 0.2 * lp) + 'px;width:' + (safe.width * 0.4 * lp) + 'px;' +
        'height:6px;border-radius:3px;background:' + th.colors.accent2 + ';opacity:0.8;';
      container.appendChild(line);
    }
  },
});
