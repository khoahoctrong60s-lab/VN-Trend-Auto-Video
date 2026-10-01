// Scene "outro": lời kêu gọi + handle kênh, trượt lên hiện dần.
Engine.registerScene({
  type: 'outro',
  defaults: {
    duration: 3,
    heading: '',
    handle: '',
  },

  validate: function (data) {
    var errors = [];
    if (!data.heading || typeof data.heading !== 'string') {
      errors.push('Thiếu trường "heading" (chuỗi)');
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;
    var safe = ctx.safe;

    // --- Hạt sáng bay lên phía sau (vị trí làm tròn px → render deterministic) ---
    for (var pi = 0; pi < 12; pi++) {
      var pxx = ((pi * 89 + 25) % 100) / 100 * ctx.width;
      var drift = ((pi * 53) % 100) / 100 * ctx.height;
      var pyy = (((drift / ctx.height - t * 0.045 - pi * 0.017) % 1) + 1) % 1 * ctx.height;
      var psz = 5 + (pi % 3) * 6;
      var pdot = document.createElement('div');
      pdot.style.cssText =
        'position:absolute;left:' + Math.round(pxx) + 'px;top:' + Math.round(pyy) + 'px;' +
        'width:' + psz + 'px;height:' + psz + 'px;border-radius:50%;' +
        'background:' + (pi % 2 ? th.colors.accent2 : th.colors.accent1) + ';' +
        'opacity:' + (0.10 + 0.08 * Math.sin(t * 1.9 + pi * 1.3)).toFixed(3) + ';';
      container.appendChild(pdot);
    }

    // --- Heading ---
    var hp = e.clamp01(p / 0.35);
    var heading = document.createElement('div');
    heading.style.cssText =
      'position:absolute;top:' + (ctx.height * 0.42 - (1 - e.easeOut(hp)) * 60) + 'px;' +
      'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
      'font-weight:800;font-size:' + th.sizes.h1 + 'px;line-height:1.2;color:' + th.colors.text +
      ';opacity:' + hp + ';';
    heading.textContent = data.heading;
    container.appendChild(heading);

    // --- Handle kênh ---
    var sp = e.clamp01((p - 0.3) / 0.3);
    if (data.handle && sp > 0) {
      var handle = document.createElement('div');
      var ep = e.easeOut(sp);
      handle.style.cssText =
        'position:absolute;top:' + (ctx.height * 0.58 - (1 - ep) * 40) + 'px;' +
        'left:' + safe.cx + 'px;transform:translateX(-50%);' +
        'padding:22px 54px;border-radius:999px;border:3px solid ' + th.colors.accent1 + '55;' +
        'background:' + th.colors.accent1 + '18;font-weight:700;font-size:56px;color:' +
        th.colors.accent1 + ';opacity:' + sp + ';white-space:nowrap;';
      handle.textContent = data.handle;
      container.appendChild(handle);
    }

    // --- Gạch chân trang trí dưới handle (hiện cuối scene) ---
    if (p > 0.7) {
      var lp = e.clamp01((p - 0.7) / 0.3);
      var underline = document.createElement('div');
      underline.style.cssText =
        'position:absolute;top:' + (ctx.height * 0.7) + 'px;' +
        'left:' + (safe.cx - 120 * lp) + 'px;width:' + (240 * lp) + 'px;height:6px;' +
        'border-radius:3px;background:' + th.colors.accent2 + ';opacity:0.9;';
      container.appendChild(underline);
    }
  },
});
