// Scene "bar-chart": các cột mọc lên lần lượt (easing back), số đếm tăng dần, nhãn dưới cột.
Engine.registerScene({
  type: 'bar-chart',
  defaults: {
    duration: 5,
    heading: '',
    unit: '',
    data: [],
  },

  validate: function (data) {
    var errors = [];
    if (!Array.isArray(data.data) || data.data.length < 1) {
      errors.push('Thiếu trường "data" (mảng {label, value})');
      return errors;
    }
    if (data.data.length > 8) {
      errors.push('data nên có tối đa 8 cột để không tràn khung');
    }
    data.data.forEach(function (d, i) {
      if (typeof d.value !== 'number' || isNaN(d.value)) {
        errors.push('data[' + i + '].value phải là số');
      }
    });
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;
    var safe = ctx.safe;

    // --- Tiêu đề ---
    var hp = e.clamp01(p / 0.18);
    if (data.heading) {
      var h = document.createElement('div');
      h.style.cssText =
        'position:absolute;top:' + (safe.top + 30 - (1 - e.easeOut(hp)) * 40) + 'px;' +
        'left:' + safe.left + 'px;width:' + safe.width + 'px;text-align:center;' +
        'font-weight:800;font-size:' + th.sizes.h2 + 'px;line-height:1.2;color:' + th.colors.text +
        ';opacity:' + hp + ';';
      h.textContent = data.heading;
      container.appendChild(h);
    }

    var items = data.data || [];
    if (!items.length) return;
    var maxVal = Math.max.apply(null, items.map(function (d) { return Math.abs(d.value); })) || 1;

    // Vùng vẽ biểu đồ
    var chartTop = safe.top + 260;
    var chartBottom = ctx.height - safe.bottom - 40;
    var chartH = chartBottom - chartTop;
    var n = items.length;
    var slotW = safe.width / n;
    var barW = Math.min(150, slotW * 0.6);

    // Trục đáy
    var axis = document.createElement('div');
    axis.style.cssText =
      'position:absolute;left:' + safe.left + 'px;right:' + safe.right + 'px;' +
      'top:' + chartBottom + 'px;height:3px;background:' + th.colors.muted + ';opacity:0.5;';
    container.appendChild(axis);

    var growStart = 0.15;
    var per = 0.65 / n; // dải tiến độ để các cột lần lượt mọc

    for (var i = 0; i < n; i++) {
      var d = items[i];
      var bp = e.clamp01((p - growStart - i * per) / (per * 0.7));
      if (bp <= 0) continue;
      var eb = e.back(bp); // mọc lên nhẹ vượt rồi tụt lại

      var accent = [th.colors.accent1, th.colors.accent2, th.colors.accent3][i % 3];
      var barH = Math.max(2, (Math.abs(d.value) / maxVal) * chartH * 0.72) * eb;

      var cx = safe.left + slotW * i + slotW / 2;

      // Thân cột
      var bar = document.createElement('div');
      bar.style.cssText =
        'position:absolute;left:' + (cx - barW / 2) + 'px;top:' + (chartBottom - barH) + 'px;' +
        'width:' + barW + 'px;height:' + barH + 'px;border-radius:14px 14px 4px 4px;' +
        'background:linear-gradient(180deg,' + accent + ',' + shade(accent, -30) + ');';
      container.appendChild(bar);

      // Số trên cột (đếm tăng dần theo tiến độ mọc)
      var shown = (d.value * e.easeOut(bp)).toFixed(d.value % 1 ? 1 : 0);
      var val = document.createElement('div');
      val.style.cssText =
        'position:absolute;left:' + (cx - slotW / 2) + 'px;width:' + slotW + 'px;' +
        'top:' + (chartBottom - barH - 62) + 'px;text-align:center;' +
        'font-weight:800;font-size:52px;color:' + accent + ';opacity:' + bp + ';';
      val.textContent = shown + (data.unit ? ' ' + data.unit : '');
      container.appendChild(val);

      // Nhãn dưới cột
      var lab = document.createElement('div');
      lab.style.cssText =
        'position:absolute;left:' + (cx - slotW / 2) + 'px;width:' + slotW + 'px;' +
        'top:' + (chartBottom + 22) + 'px;text-align:center;' +
        'font-size:36px;color:' + th.colors.muted + ';opacity:' + bp + ';';
      lab.textContent = d.label;
      container.appendChild(lab);
    }
  },
});

// Làm tối/sáng màu hex một lượng (-100..100)
function shade(hex, amt) {
  var num = parseInt(hex.slice(1), 16);
  var r = Math.min(255, Math.max(0, (num >> 16) + amt));
  var g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amt));
  var b = Math.min(255, Math.max(0, (num & 255) + amt));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
