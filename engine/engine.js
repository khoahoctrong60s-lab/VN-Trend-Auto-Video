// Engine trung tâm: timeline, setTime(t), dựng scene, chuyển cảnh.
// Toàn bộ animation tính từ t (giây) — deterministic, không rAF/timeout/CSS animation
// (rAF chỉ dùng cho chế độ xem thử và chờ font, không dùng khi render).
(function (global) {
  'use strict';

  // Danh sách scene khả dụng (scene JS tự đăng ký qua Engine.registerScene)
  var registry = {};

  var STATE = {
    content: null,
    theme: null,
    scenes: [],        // [{ def, data, start, end, duration, index }]
    duration: 0,
    width: 1080,
    height: 1920,
    format: 'vertical',
    fps: 30,
    renderMode: false,
    ready: false,
    playing: false,
    time: 0,
    rafId: 0,
    current: -1,       // index scene đang hiển thị
    currentDom: null,  // DOM của scene hiện tại (tạo lại khi đổi scene)
    audio: null,       // <audio> nhạc nền, chỉ ở chế độ xem thử
    manifest: null,    // manifest audio (narration + SFX timing) ở chế độ xem thử
    voices: [],        // các <audio> lời đọc (thứ tự theo manifest.entries)
    sfx: [],           // [{audio, at}] SFX đã nạp, sắp theo thời điểm
    sfxCursor: 0,      // con trỏ SFX tiếp theo cần phát
    muted: false,      // trạng thái tắt tiếng (nút 🔊)
    lastSyncT: 0,      // mốc t của lần sync audio trước (phát hiện tua)
  };

  var lastTs = 0; // timestamp của frame trước trong chế độ phát thử

  function registerScene(def) {
    if (!def || !def.type) throw new Error('Scene thiếu "type"');
    registry[def.type] = def;
  }

  // ---- Timeline ---------------------------------------------------------------
  function buildTimeline(content) {
    var t = 0;
    STATE.scenes = (content.scenes || []).map(function (data, i) {
      var def = registry[data.type];
      if (!def) throw new Error('Chưa đăng ký scene type "' + data.type + '" (scene ' + (i + 1) + ')');
      var duration = Number(data.duration) > 0
        ? Number(data.duration)
        : ((def.defaults && def.defaults.duration) || 3);
      var item = { def: def, data: data, start: t, end: t + duration, duration: duration, index: i };
      t += duration;
      return item;
    });
    if (!STATE.scenes.length) throw new Error('content.json không có scene nào');
    STATE.duration = t;
    return STATE.scenes;
  }

  function findSceneIndex(t) {
    for (var i = STATE.scenes.length - 1; i >= 0; i--) {
      if (t >= STATE.scenes[i].start) return i;
    }
    return 0;
  }

  // ---- Ngữ cảnh truyền vào scene ---------------------------------------------
  function makeCtx() {
    var theme = STATE.theme;
    var m = (theme && theme.safeMargin) || 80;
    var vertical = STATE.format === 'vertical';
    // Vùng an toàn: chừa chỗ UI TikTok/Reels (trên ~150px, dưới ~250px với vertical)
    var safe = {
      left: m,
      right: m,
      top: vertical ? 150 : m,
      bottom: vertical ? 250 : m,
    };
    safe.width = STATE.width - safe.left - safe.right;
    safe.height = STATE.height - safe.top - safe.bottom;
    safe.cx = safe.left + safe.width / 2;
    safe.cy = safe.top + safe.height / 2;
    return {
      theme: theme,
      easing: global.Easing,
      width: STATE.width,
      height: STATE.height,
      safe: safe,
      format: STATE.format,
      sceneDuration: 0, // được gán trước khi render
      totalDuration: STATE.duration,
      fps: STATE.fps,
    };
  }

  // ---- DOM scene ---------------------------------------------------------------
  // Scale sân khấu về cỡ cửa sổ (giữ tỉ lệ) — toạ độ scene luôn theo WIDTH/HEIGHT gốc
  function applyStageTransform() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var s = Math.min(window.innerWidth / STATE.width, window.innerHeight / STATE.height);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  function swapSceneDom(index) {
    var container = document.getElementById('stage');
    if (STATE.currentDom) {
      STATE.currentDom.remove();
      STATE.currentDom = null;
    }
    STATE.current = index;
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;';
    container.appendChild(el);
    STATE.currentDom = el;
  }

  // ---- setTime: vẽ lại đúng trạng thái tại t -----------------------------------
  function setTime(t) {
    if (!STATE.ready || !STATE.scenes.length) return;
    t = Math.max(0, Math.min(t, STATE.duration));
    STATE.time = t;

    var idx = findSceneIndex(t);
    if (idx !== STATE.current) swapSceneDom(idx);
    var scene = STATE.scenes[idx];
    var local = t - scene.start;
    var p = scene.duration > 0 ? Math.min(1, local / scene.duration) : 0;

    var ctx = makeCtx();
    ctx.sceneDuration = scene.duration;
    ctx.sceneData = scene.data;
    scene.def.render(STATE.currentDom, p, local, ctx);

    // Chuyển cảnh: fade hoặc slide-up (kéo lên + phóng nhẹ), áp dụng đầu scene
    var trans = STATE.content.transition || {};
    var td = Number(trans.duration) || 0;
    var el = STATE.currentDom;
    if (trans.type !== 'none' && td > 0 && idx > 0 && local < td) {
      var tp = global.Easing.easeInOut(local / td);
      el.style.opacity = String(tp);
      if (trans.type === 'slide-up') {
        // Giá trị làm tròn để render deterministic
        el.style.transform = 'translateY(' + Math.round((1 - tp) * 60) + 'px) scale(' +
          (0.97 + 0.03 * tp).toFixed(4) + ')';
      } else {
        el.style.transform = 'none';
      }
    } else {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }

    // Đồng bộ audio (nhạc + lời đọc + SFX) — chỉ chế độ xem thử; render tự trộn bằng FFmpeg
    syncAudio(t);

    updateControls(t);

    // Thanh tiến trình (chỉ xem thử)
    var pb = document.getElementById('progress-fill');
    if (pb) pb.style.width = (STATE.duration ? (t / STATE.duration) * 100 : 0).toFixed(3) + '%';
  }

  // ---- Audio chế độ xem thử -------------------------------------------------------
  function makeAudio(src, vol) {
    var a = new Audio(src);
    a.preload = 'auto';
    a.volume = vol;
    a.muted = STATE.muted;
    return a;
  }

  // Nạp nhạc nền (từ content.audio.music) + lời đọc/SFX (từ manifest.json)
  function initAudio() {
    if (STATE.renderMode) return;
    var aud = STATE.content.audio || {};
    if (aud.music) {
      var a = makeAudio(aud.music, aud.musicVolume != null ? aud.musicVolume : 0.25);
      a.loop = true;
      STATE.audio = a;
    }
    if (!aud.manifest) return;
    fetch(aud.manifest)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m) return;
        STATE.manifest = m;
        (m.entries || []).forEach(function (e) {
          STATE.voices.push(e.file ? makeAudio('/assets/audio/' + e.file, 1) : null);
        });
        (m.sfx || []).forEach(function (s) {
          STATE.sfx.push({ audio: makeAudio('/assets/audio/' + s.file, s.volume || 0.8), at: s.at });
        });
        STATE.sfx.sort(function (x, y) { return x.at - y.at; });
        STATE.sfxCursor = 0;
      })
      .catch(function () { /* thiếu manifest — preview vẫn chạy, chỉ không có audio */ });
  }

  // Đồng bộ audio theo t: nhạc nền, lời đọc theo scene (seek chính xác), SFX bắn theo mốc
  function syncAudio(t) {
    var playing = STATE.playing;
    if (STATE.audio) {
      if (playing) {
        if (Math.abs(STATE.audio.currentTime - t) > 0.15) STATE.audio.currentTime = t;
      } else {
        if (!STATE.audio.paused) STATE.audio.pause();
        try { STATE.audio.currentTime = Math.min(t, STATE.audio.duration || t); } catch (e) { /* chưa nạp xong */ }
      }
    }
    var m = STATE.manifest;
    if (!m) return;
    // Khi tua (nhảy >0.5s): đặt lại con trỏ SFX, dừng mọi âm đang phát
    if (Math.abs(t - STATE.lastSyncT) > 0.5) {
      STATE.sfxCursor = 0;
      while (STATE.sfxCursor < STATE.sfx.length && STATE.sfx[STATE.sfxCursor].at <= t) STATE.sfxCursor++;
      STATE.voices.forEach(function (v) { if (v && !v.paused) v.pause(); });
      STATE.sfx.forEach(function (s) { if (!s.audio.paused) s.audio.pause(); });
    }
    STATE.lastSyncT = t;
    if (!playing) return;
    m.entries.forEach(function (e, i) {
      var v = STATE.voices[i];
      if (!v) return;
      var ns = e.narrStart != null ? e.narrStart : e.start;
      var nd = e.narrDur || 0;
      if (nd > 0 && t >= ns && t < ns + nd) {
        if (v.paused) {
          try { v.currentTime = t - ns; } catch (err) { /* chưa nạp */ }
          v.play().catch(function () {});
        } else if (Math.abs(v.currentTime - (t - ns)) > 0.3) {
          try { v.currentTime = t - ns; } catch (err) { /* chưa nạp */ }
        }
      } else if (!v.paused) {
        v.pause();
      }
    });
    while (STATE.sfxCursor < STATE.sfx.length && STATE.sfx[STATE.sfxCursor].at <= t) {
      var s = STATE.sfx[STATE.sfxCursor++];
      try { s.audio.currentTime = 0; } catch (err) { /* chưa nạp */ }
      s.audio.play().catch(function () {});
    }
  }

  // ---- Điều khiển xem thử --------------------------------------------------------
  function updateControls(t) {
    var c = document.getElementById('controls');
    if (!c || c.style.display === 'none') return;
    document.getElementById('time').textContent =
      t.toFixed(2) + ' / ' + STATE.duration.toFixed(2) + 's';
    var seek = document.getElementById('seek');
    if (document.activeElement !== seek) {
      seek.value = String(Math.round(STATE.duration ? (t / STATE.duration) * 1000 : 0));
    }
    var sel = document.getElementById('scene-select');
    var idx = String(findSceneIndex(t));
    if (sel.value !== idx && document.activeElement !== sel) sel.value = idx;
    var btn = document.getElementById('btn-play');
    var label = STATE.playing ? '⏸ Pause' : '▶ Play';
    if (btn.textContent !== label) btn.textContent = label;
  }

  function stopPlayback() {
    STATE.playing = false;
    cancelAnimationFrame(STATE.rafId);
    if (STATE.audio) STATE.audio.pause();
    STATE.voices.forEach(function (v) { if (v && !v.paused) v.pause(); });
    STATE.sfx.forEach(function (s) { if (!s.audio.paused) s.audio.pause(); });
  }

  function initControls() {
    var c = document.getElementById('controls');
    if (!c) return;
    if (STATE.renderMode) { c.style.display = 'none'; return; }
    c.style.display = 'flex';
    var pr = document.getElementById('progress');
    if (pr) pr.style.display = 'block';

    // Nút tắt/bật tiếng (nhạc + lời đọc + SFX)
    var muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        STATE.muted = !STATE.muted;
        [STATE.audio].concat(STATE.voices).concat(STATE.sfx.map(function (s) { return s.audio; }))
          .forEach(function (a) { if (a) a.muted = STATE.muted; });
        muteBtn.textContent = STATE.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
      });
    }

    // Đổ danh sách scene vào dropdown
    var sel = document.getElementById('scene-select');
    STATE.scenes.forEach(function (scene, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = (i + 1) + '. ' + scene.def.type + ' (' + scene.duration.toFixed(1) + 's)';
      sel.appendChild(opt);
    });

    document.getElementById('btn-play').addEventListener('click', function () {
      if (STATE.playing) {
        stopPlayback();
      } else {
        if (STATE.time >= STATE.duration - 0.01) STATE.time = 0;
        STATE.playing = true;
        lastTs = 0;
        if (STATE.audio) {
          try { STATE.audio.currentTime = STATE.time; } catch (e) {}
          STATE.audio.play().catch(function () {});
        }
        STATE.rafId = requestAnimationFrame(tick);
      }
      updateControls(STATE.time);
    });

    document.getElementById('seek').addEventListener('input', function (e) {
      stopPlayback();
      setTime((Number(e.target.value) / 1000) * STATE.duration);
    });

    sel.addEventListener('change', function (e) {
      stopPlayback();
      var scene = STATE.scenes[Number(e.target.value)];
      if (scene) setTime(scene.start + 0.001);
    });
  }

  // Vòng lặp phát thử (chỉ chạy khi KHÔNG render)
  function tick(ts) {
    if (!STATE.playing) return;
    if (!lastTs) lastTs = ts;
    var next = STATE.time + (ts - lastTs) / 1000;
    lastTs = ts;
    if (next >= STATE.duration) {
      setTime(STATE.duration - 0.001);
      stopPlayback();
      updateControls(STATE.time);
      return;
    }
    setTime(next);
    STATE.rafId = requestAnimationFrame(tick);
  }

  // ---- Chờ font/asset cục bộ -----------------------------------------------------
  // Chờ mọi file scene kịp đăng ký (script động nạp không đồng bộ với boot)
  function waitForScenes() {
    return new Promise(function (resolve, reject) {
      (function check(attempt) {
        if (global.SCENES_LOADED) return resolve();
        if (attempt > 300) return reject(new Error('Chờ scene đăng ký quá lâu (script lỗi?)'));
        setTimeout(function () { check(attempt + 1); }, 10);
      })(0);
    });
  }

  function waitForAssets(theme) {
    var loads = [];
    if (document.fonts && theme && theme.fonts) {
      var fam = theme.fonts.heading || theme.fonts.body;
      // Nhúng cả chữ có dấu để trình duyệt tải đúng subset tiếng Việt
      var sample = 'ÁÀẠẢÃĂẮẰẲẴẶÂẤẦẨẪẬĐÉÈẸẺẼÊẾỀỂỄỆÍÌỊỈĨÓÒỌỎÕÔỐỒỔỖỘƠỚỜỞỠỢÚÙỤỦŨƯỨỪỬỮỰÝỲỴỶỸ';
      ['400', '700', '800'].forEach(function (w) {
        loads.push(document.fonts.load(w + ' 32px "' + fam + '"', sample).catch(function () {}));
      });
    }
    // fonts.ready + giới hạn 15s để không treo render nếu font lỗi
    var fontsReady = document.fonts
      ? Promise.race([
          document.fonts.ready,
          new Promise(function (r) { setTimeout(r, 15000); }),
        ])
      : Promise.resolve();
    return Promise.all(loads)
      .then(function () { return fontsReady; })
      .then(function () {
        // Ở chế độ xem thử: chờ thêm 2 khung vẽ để font thay thế hoàn toàn.
        // Ở chế độ render bỏ qua rAF — nhiều tab chụp song song có thể đói frame
        // khiến rAF không bao giờ chạy.
        if (STATE.renderMode) return null;
        return new Promise(function (r) {
          requestAnimationFrame(function () { requestAnimationFrame(r); });
        });
      });
  }

  // ---- Khởi động ------------------------------------------------------------------
  function boot() {
    var params = new URLSearchParams(location.search);
    var contentUrl = params.get('content') || '/content/content.json';
    var themeOverride = params.get('theme');
    STATE.renderMode = params.get('render') === '1';

    fetch(contentUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('Không nạp được ' + contentUrl);
        return r.json();
      })
      .then(function (content) {
        if (!content.meta) throw new Error('Thiếu meta trong content');
        if (themeOverride) content.meta = Object.assign({}, content.meta, { theme: themeOverride });
        STATE.content = content;
        STATE.format = content.meta.format || 'vertical';
        STATE.fps = Number(content.meta.fps) || 30;
        var dims = {
          vertical: [1080, 1920],
          horizontal: [1920, 1080],
          square: [1080, 1080],
        }[STATE.format];
        if (!dims) throw new Error('Format không hỗ trợ: ' + STATE.format);
        STATE.width = dims[0];
        STATE.height = dims[1];
        return fetch('/themes/' + content.meta.theme + '.json');
      })
      .then(function (r) {
        if (!r.ok) throw new Error('Không nạp được theme "' + STATE.content.meta.theme + '"');
        return r.json();
      })
      .then(function (theme) {
        STATE.theme = theme;
        var container = document.getElementById('video-container');
        var stage = document.getElementById('stage');
        // Sân khấu đúng kích thước video; co bằng transform về cỡ cửa sổ
        stage.style.width = STATE.width + 'px';
        stage.style.height = STATE.height + 'px';
        stage.style.background = theme.colors.bg;
        applyStageTransform();
        window.addEventListener('resize', applyStageTransform);
        container.style.background = theme.colors.bg;
        container.style.color = theme.colors.text;
        container.style.fontFamily =
          "'" + ((theme.fonts && theme.fonts.body) || 'sans-serif') + "', sans-serif";
        return waitForScenes().then(function () {
          buildTimeline(STATE.content);
          initControls();
          initAudio(); // nhạc + lời đọc + SFX (chỉ chế độ xem thử)
          return waitForAssets(theme);
        });
      })
      .then(function () {
        setTime(0);
        // Xuất hằng số cho render.js đọc
        global.DURATION = STATE.duration;
        global.FPS = STATE.fps;
        global.WIDTH = STATE.width;
        global.HEIGHT = STATE.height;
        STATE.ready = true;
        global.READY = true;
        if (!STATE.renderMode) {
          STATE.playing = true;
          lastTs = 0;
          if (STATE.audio) STATE.audio.play().catch(function () {});
          STATE.rafId = requestAnimationFrame(tick);
        }
      })
      .catch(function (err) {
        console.error('Engine boot lỗi:', err);
        global.BOOT_ERROR = String((err && err.message) || err);
        var container = document.getElementById('video-container');
        if (container) {
          container.style.display = 'flex';
          container.style.alignItems = 'center';
          container.style.justifyContent = 'center';
          container.style.color = '#ff7b7b';
          container.style.font = '32px system-ui, sans-serif';
          container.textContent = 'Lỗi nạp dữ liệu: ' + global.BOOT_ERROR;
        }
        global.READY = true; // vẫn báo READY để render.js không treo
      });
  }

  // ---- API công khai ----------------------------------------------------------------
  global.setTime = setTime;
  global.Engine = {
    registerScene: registerScene,
    state: STATE,
    findSceneIndex: findSceneIndex,
    makeCtx: makeCtx,
    buildTimeline: buildTimeline,
  };

  boot();
})(window);
