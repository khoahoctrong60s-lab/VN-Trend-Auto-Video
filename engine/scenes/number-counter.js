// Scene "number-counter": một con số lớn đếm từ 0 đến giá trị, kèm đơn vị và mô tả.
Engine.registerScene({
  type: 'number-counter',
  defaults: {
    duration: 4,
    value: 0,
    unit: '',
    caption: '',
  },

  validate: function (data) {
    var errors = [];
    if (typeof data.value !== 'number' || isNaN(data.value)) {
      errors.push('Thiếu hoặc sai trường "value" (số)');
    }
    return errors;
  },

  render: function (container, p, t, ctx) {
    var data = Object.assign({}, this.defaults, ctx.sceneData || {});
    container.innerHTML = '';

    var th = ctx.theme;
    var e = ctx.easing;

    // Con số đếm theo easeOut (nhanh đầu, chậm cuối cho tự nhiên)
    var cp = e.clamp01(p / 0.7);
    var value = data.value * e.easeOut(cp);
    var decimals = data.value % 1 !== 0 ? 1 : 0;
    var shown = value.toFixed(decimals);

    // --- Số lớn ---
    var num = document.createElement('div');
    // Làm tròn về pixel nguyên → raster hóa giống nhau ở mọi lần render
    var numTop = Math.round(ctx.height * 0.4 - ctx.height * 0.02 * e.easeOut(cp));
    num.style.cssText =
      'position:absolute;top:' + numTop + 'px;' +
      'left:0;right:0;text-align:center;font-weight:800;' +
      'font-size:' + Math.round(ctx.height * 0.09) + 'px;line-height:1.1;' +
      'color:' + th.colors.accent1 + ';';
    num.textContent = shown + (data.unit ? ' ' + data.unit : '');
    container.appendChild(num);

    // --- Caption ---
    var kp = e.clamp01((p - 0.35) / 0.3);
    if (data.caption && kp > 0) {
      var cap = document.createElement('div');
      cap.style.cssText =
        'position:absolute;top:' + Math.round(ctx.height * 0.56 - (1 - e.easeOut(kp)) * 30) + 'px;' +
        'left:' + ctx.safe.left + 'px;width:' + ctx.safe.width + 'px;text-align:center;' +
        'font-size:' + th.sizes.body + 'px;color:' + th.colors.muted + ';opacity:' + kp + ';';
      cap.textContent = data.caption;
      container.appendChild(cap);
    }

    // --- Vòng cung progress quanh số (trang trí, phản ánh tiến độ đếm) ---
    var arc = document.createElement('div');
    arc.style.cssText =
      'position:absolute;left:' + (ctx.safe.cx - 260) + 'px;top:' + (ctx.height * 0.4 - 260) + 'px;' +
      'width:520px;height:520px;border-radius:50%;border:6px solid transparent;' +
      'border-top-color:' + th.colors.accent2 + ';opacity:0.35;' +
      'transform:rotate(' + Math.round(cp * 360) + 'deg);'; // nguyên độ → tránh raster phân số
    container.appendChild(arc);
  },
});
