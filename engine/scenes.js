// Loader: tự đăng ký mọi scene trong engine/scenes/.
// Thêm scene mới = thêm 1 file trong thư mục này + 1 dòng dưới đây (hoặc sửa loader này).
(function () {
  var sceneFiles = [
    'title',
    'bullets',
    'bar-chart',
    'line-chart',
    'number-counter',
    'quote',
    'comparison',
    'outro',
    // thêm tên scene mới vào đây
  ];
  window.SCENE_TYPES = sceneFiles; // validate.js đọc danh sách type đã đăng ký
  // Engine chờ cờ này trước khi dựng timeline (tránh race nạp script)
  window.SCENES_LOADED = false;
  var loaded = 0;
  sceneFiles.forEach(function (name) {
    var s = document.createElement('script');
    s.src = '/engine/scenes/' + name + '.js';
    s.async = false; // nạp tuần tự theo thứ tự khai báo
    s.onload = function () {
      if (++loaded === sceneFiles.length) window.SCENES_LOADED = true;
    };
    s.onerror = function () {
      console.error('Không nạp được scene: ' + name);
      if (++loaded === sceneFiles.length) window.SCENES_LOADED = true;
    };
    document.head.appendChild(s);
  });
})();
