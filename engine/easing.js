// Toán easing dùng chung cho mọi scene (hàm thuần, deterministic theo t)
(function (global) {
  'use strict';

  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  const easing = {
    // Thẳng, không gia tốc
    linear(t) {
      return clamp01(t);
    },

    // Chậm -> nhanh dần
    easeIn(t) {
      t = clamp01(t);
      return t * t;
    },

    // Nhanh -> chậm dần (thường dùng cho chữ trượt lên)
    easeOut(t) {
      t = clamp01(t);
      return 1 - Math.pow(1 - t, 3);
    },

    // Chậm -> nhanh -> chậm
    easeInOut(t) {
      t = clamp01(t);
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    // Vượt nhẹ rồi tụt về (dùng cho cột mọc lên)
    back(t) {
      t = clamp01(t);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },

    // Dội đàn hồi (dùng cho điểm nhấn)
    elastic(t) {
      t = clamp01(t);
      if (t === 0 || t === 1) return t;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    clamp01,

    // Nội suy tuyến tính
    lerp(a, b, t) {
      return a + (b - a) * clamp01(t);
    },

    // Nội suy màu hex đơn giản (dùng cho fade màu)
    lerpColor(a, b, t) {
      t = clamp01(t);
      const pa = parseInt(a.slice(1), 16);
      const pb = parseInt(b.slice(1), 16);
      const r = Math.round(this.lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
      const g = Math.round(this.lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
      const bl = Math.round(this.lerp(pa & 255, pb & 255, t));
      return 'rgb(' + r + ',' + g + ',' + bl + ')';
    },
  };

  global.Easing = easing;
})(window);
