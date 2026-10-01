// Scene "comparison": hai cột A vs B, các dòng so sánh hiện lần lượt.
Engine.registerScene({
  type: 'comparison',
  defaults: {
    duration: 5,
    heading: '',
    left: { title: '', items: [] },
    right: { title: '', items: [] },
  },

  validate: function (data) {
    var errors = [];
    if (!data.left || !Array.isArray(data.left.items) || !data.left.items.length) {
      errors.push('Thiếu "left.items" (mảng chuỗi)');
    }
    if (!data.right || !Array.isArray(data.right.items) || !data.right.items.length) {
      errors.push('Thiếu "right.items" (mảng chuỗi)');
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;
    var safe = ctx.safe;

    // --- Heading ---
    var hp = e.clamp01(p / 0.15);
    if (data.heading) {
      var h = document.createElement('div');
      h.style.cssText =
        'position:absolute;top:' + Math.round(safe.top + 30 - (1 - e.easeOut(hp)) * 40) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        'font-weight:800;font-size:' + th.sizes.h2 + 'px;line-height:1.2;color:' + th.colors.text +
        ';opacity:' + hp + ';';
      h.textContent = data.heading;
      container.appendChild(h);
    }

    // --- Hai cột ---
    var colTop = safe.top + 240;
    var colBottom = ctx.height - safe.bottom - 40;
    var gap = 40;
    var colW = Math.round((safe.width - gap) / 2);

    var cols = [
      { cfg: data.left, accent: th.colors.muted, bg: 'rgba(127,140,170,0.12)' },
      { cfg: data.right, accent: th.colors.accent1, bg: 'rgba(62,198,255,0.10)' },
    ];

    cols.forEach(function (col, ci) {
      if (!col.cfg) return;
      // Thẻ hiện dần theo chiều cao (trượt lên)
      var cp = e.clamp01((p - 0.08 - ci * 0.06) / 0.25);
      if (cp <= 0) return;
      var ep = e.easeOut(cp);

      var card = document.createElement('div');
      // Làm tròn vị trí/kích thước về pixel nguyên → raster deterministic
      card.style.cssText =
        'position:absolute;top:' + Math.round(colTop + (1 - ep) * 60) + 'px;' +
        'left:' + Math.round(safe.left + ci * (colW + gap)) + 'px;width:' + colW + 'px;height:' +
        Math.round((colBottom - colTop) * ep) + 'px;' +
        'background:' + col.bg + ';border-radius:24px;' +
        'border:2px solid ' + col.accent + '33;overflow:hidden;';
      container.appendChild(card);

      if (cp < 1) return; // khi thẻ chưa hiện xong thì chưa render nội dung

      // --- Tiêu đề cột ---
      var title = document.createElement('div');
      title.style.cssText =
        'padding:34px 30px 22px;text-align:center;font-weight:800;font-size:48px;color:' +
        col.accent + ';';
      title.textContent = col.cfg.title || '';
      card.appendChild(title);

      // --- Các dòng so sánh hiện lần lượt ---
      var items = col.cfg.items || [];
      var n = items.length;
      var startAt = 0.35;
      var per = 0.5 / n;

      for (var i = 0; i < n; i++) {
        var ip = e.clamp01((p - startAt - i * per) / (per * 0.7));
        if (ip <= 0) continue;
        var row = document.createElement('div');
        row.style.cssText =
          'padding:20px 34px;display:flex;align-items:center;gap:18px;opacity:' + ip + ';' +
          'transform:translateX(' + Math.round((1 - e.easeOut(ip)) * 30 * (ci === 0 ? -1 : 1)) + 'px);';

        var icon = document.createElement('div');
        icon.style.cssText =
          'flex:0 0 auto;width:14px;height:14px;border-radius:50%;background:' + col.accent +
          ';opacity:0.9;';
        row.appendChild(icon);

        var txt = document.createElement('div');
        txt.style.cssText =
          'font-size:40px;line-height:1.3;color:' + th.colors.text + ';font-weight:500;';
        txt.textContent = items[i];
        row.appendChild(txt);

        card.appendChild(row);
      }
    });
  },
});
