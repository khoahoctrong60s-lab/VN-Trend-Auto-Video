// Scene "line-chart": đường vẽ dần từ trái sang phải (SVG), điểm nhấn hiện theo.
Engine.registerScene({
  type: 'line-chart',
  defaults: {
    duration: 5,
    heading: '',
    unit: '',
    data: [],
  },

  validate: function (data) {
    var errors = [];
    if (!Array.isArray(data.data) || data.data.length < 2) {
      errors.push('Thiếu trường "data" (mảng {label, value}, tối thiểu 2 điểm)');
      return errors;
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
    var W = ctx.width;

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
    if (items.length < 2) return;

    // Toạ độ vùng vẽ
    var left = safe.left + 40;
    var right = W - safe.right - 40;
    var top = safe.top + 280;
    var bottom = ctx.height - safe.bottom - 60;
    var minV = Math.min.apply(null, items.map(function (d) { return d.value; }));
    var maxV = Math.max.apply(null, items.map(function (d) { return d.value; }));
    if (maxV === minV) maxV = minV + 1;

    function ptX(i) { return left + ((right - left) * i) / (items.length - 1); }
    function ptY(v) { return bottom - ((v - minV) / (maxV - minV)) * (bottom - top); }

    // Đường fill nhẹ dưới đường chính
    var drawP = e.easeInOut(e.clamp01((p - 0.1) / 0.6)); // tiến độ vẽ đường 10%->70% scene
    var pts = items.map(function (d, i) { return ptX(i) + ',' + ptY(d.value); });

    var svgNs = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', ctx.height);
    svg.style.cssText = 'position:absolute;inset:0;';

    function svgEl(name, attrs) {
      var el = document.createElementNS(svgNs, name);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    // Vùng tô dưới đường (mờ dần theo tiến độ vẽ)
    var area = svgEl('polygon', {
      points: ptX(0) + ',' + bottom + ' ' + pts.join(' ') + ' ' + ptX(items.length - 1) + ',' + bottom,
      fill: th.colors.accent1,
      opacity: 0.12 * drawP,
    });
    svg.appendChild(area);

    // Đường chính — vẽ dần bằng stroke-dasharray theo drawP
    var polyline = svgEl('polyline', {
      points: pts.join(' '),
      fill: 'none',
      stroke: th.colors.accent1,
      'stroke-width': 8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    // Tính chiều dài polyline xấp xỉ để set dasharray
    var len = 0;
    for (var i = 1; i < items.length; i++) {
      var dx = ptX(i) - ptX(i - 1);
      var dy = ptY(items[i].value) - ptY(items[i - 1].value);
      len += Math.sqrt(dx * dx + dy * dy);
    }
    polyline.setAttribute('stroke-dasharray', len);
    polyline.setAttribute('stroke-dashoffset', len * (1 - drawP));
    svg.appendChild(polyline);

    // Điểm nhấn + nhãn giá trị: hiện lần lượt theo khi đường đi qua
    for (var j = 0; j < items.length; j++) {
      var tArrive = j / (items.length - 1); // 0..1 theo trục x
      var showP = e.clamp01((drawP - tArrive) / 0.12);
      if (showP <= 0) continue;
      var ep = e.elastic(showP);

      var accent = th.colors.accent2;
      var px = ptX(j), py = ptY(items[j].value);

      var dot = svgEl('circle', {
        cx: px, cy: py,
        r: 10 + 6 * ep,
        fill: accent,
        stroke: th.colors.bg,
        'stroke-width': 4,
        opacity: e.clamp01(showP * 2),
      });
      svg.appendChild(dot);

      // Nhãn giá trị trên điểm
      var val = document.createElement('div');
      val.style.cssText =
        'position:absolute;left:' + (px - 90) + 'px;width:180px;top:' + (py - 78) + 'px;' +
        'text-align:center;font-weight:800;font-size:40px;color:' + accent + ';opacity:' +
        e.clamp01(showP * 2) + ';transform:scale(' + (0.6 + 0.4 * ep) + ');';
      val.textContent = items[j].value + (data.unit ? ' ' + data.unit : '');
      container.appendChild(val);

      // Nhãn trục x dưới điểm
      var lab = document.createElement('div');
      lab.style.cssText =
        'position:absolute;left:' + (px - 90) + 'px;width:180px;top:' + (bottom + 26) + 'px;' +
        'text-align:center;font-size:34px;color:' + th.colors.muted + ';opacity:' +
        e.clamp01(showP * 2) + ';';
      lab.textContent = items[j].label;
      container.appendChild(lab);
    }

    container.appendChild(svg);
  },
});
