/* 3D 姿势预演台 · 网页版交互与下载 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var EXPORT_W = 1080;
  var EXPORT_H = 1440;

  var canvas = $('gl');
  var stage = $('stage');
  var stageWrap = $('stageWrap');
  var loading = $('loading');
  var hint = $('hint');
  var overlay = $('overlay');
  var overlayTitle = $('overlayTitle');
  var overlayText = $('overlayText');
  var saveBtn = $('saveBtn');
  var jointLabel = $('jointLabel');
  var toastEl = $('toast');
  var modal = $('modal');
  var modalSub = $('modalSub');
  var previewImg = $('previewImg');

  var PRESETS = [
    { id: 'stand', label: '站姿', root: [0, 0, 0], bones: {} },
    {
      id: 'lookback', label: '回眸', root: [0, 0, 0], bones: {
        hips: [0, -8, 0], spine: [0, 8, 0], chest: [0, 16, 0], head: [0, 42, 0],
        armL: [12, 0, 6], forearmL: [-16, 0, 0],
        armR: [-10, 0, -6], forearmR: [-22, 0, 0]
      }
    },
    {
      id: 'walk', label: '行走', root: [0, -0.035, 0], bones: {
        hips: [0, -5, 0], chest: [2, 5, 0], head: [0, -4, 0],
        armL: [26, 0, 5], forearmL: [-30, 0, 0],
        armR: [-24, 0, -5], forearmR: [-26, 0, 0],
        thighL: [-24, 0, 2], shinL: [8, 0, 0], footL: [-6, 0, 0],
        thighR: [20, 0, -2], shinR: [10, 0, 0], footR: [-28, 0, 0]
      }
    },
    {
      id: 'run', label: '跑动', root: [0, 0.04, 0], bones: {
        hips: [4, -8, 0], chest: [10, 8, 0], head: [-6, -6, 0],
        armL: [58, 0, 8], forearmL: [-74, 0, 0],
        armR: [-52, 0, -8], forearmR: [-70, 0, 0],
        thighL: [-52, 0, 3], shinL: [44, 0, 0], footL: [10, 0, 0],
        thighR: [36, 0, -3], shinR: [76, 0, 0], footR: [-26, 0, 0]
      }
    },
    {
      id: 'squat', label: '蹲姿', root: [0, -0.30, 0], bones: {
        chest: [18, 0, 0], head: [-14, 0, 0],
        armL: [-34, 0, 12], forearmL: [-46, 0, 0],
        armR: [-34, 0, -12], forearmR: [-46, 0, 0],
        thighL: [-72, 0, 8], shinL: [82, 0, 0], footL: [2, 0, 0],
        thighR: [-72, 0, -8], shinR: [82, 0, 0], footR: [2, 0, 0]
      }
    },
    {
      id: 'handup', label: '举手', root: [0, 0, 0], bones: {
        hips: [0, 6, 0], chest: [-4, 6, 0], head: [0, 10, 0],
        armL: [6, 0, 152], forearmL: [0, 0, 12],
        armR: [8, 0, -8], forearmR: [-14, 0, 0]
      }
    },
    {
      id: 'cross', label: '抱臂', root: [0, 0, 0], bones: {
        chest: [-2, 0, 0], head: [0, 4, 0],
        armL: [-50, 0, 10], forearmL: [-126, 0, -79],
        armR: [-50, 0, -10], forearmR: [-126, 0, 79]
      }
    },
    {
      id: 'lean', label: '后仰', root: [0, -0.03, 0], bones: {
        hips: [10, 0, 0], spine: [-6, 0, 0], chest: [-18, 0, 0], head: [-12, 0, 0],
        armL: [22, 0, 26], forearmL: [-30, 0, 0],
        armR: [22, 0, -26], forearmR: [-30, 0, 0],
        thighL: [-12, 0, 4], shinL: [16, 0, 0],
        thighR: [-12, 0, -4], shinR: [16, 0, 0]
      }
    },
    {
      id: 'stretch', label: '伸展', root: [0, 0, 0], bones: {
        chest: [-10, 0, 0], head: [-14, 0, 0],
        armL: [0, 0, 158], forearmL: [0, 0, 16],
        armR: [0, 0, -158], forearmR: [0, 0, -16],
        thighL: [0, 0, 5], thighR: [0, 0, -5]
      }
    }
  ];

  var FRAMES = [
    { id: 'full', label: '全身' },
    { id: 'medium', label: '七分身' },
    { id: 'half', label: '半身' },
    { id: 'close', label: '特写' }
  ];

  var LENSES = [
    { id: 24, label: '24mm' },
    { id: 35, label: '35mm' },
    { id: 50, label: '50mm' },
    { id: 85, label: '85mm' },
    { id: 135, label: '135mm' }
  ];

  var LIGHT_CELLS = [
    { az: 225, glyph: '↖' },
    { az: 180, glyph: '↑' },
    { az: 135, glyph: '↗' },
    { az: 270, glyph: '←' },
    { center: true, glyph: '顶' },
    { az: 90, glyph: '→' },
    { az: 315, glyph: '↙' },
    { az: 0, glyph: '↓' },
    { az: 45, glyph: '↘' }
  ];

  var BGS = [
    { id: 'warm', label: '暖灰' },
    { id: 'light', label: '白' },
    { id: 'dark', label: '深灰' }
  ];

  var PROPS = [
    { id: 'none', label: '无' },
    { id: 'platform', label: '圆台' },
    { id: 'stool', label: '方凳' },
    { id: 'wall', label: '矮墙' }
  ];

  var engine = null;
  var lightAz = 315;
  var lightTop = false;
  var toastTimer = 0;

  /* ---------- 通用 ---------- */
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.className = 'toast is-on';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.className = 'toast';
    }, 2400);
  }

  function isDesktop() {
    return window.innerWidth > 860;
  }

  function setAppHeight() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
  }

  function buildChips(container, items, current, onPick) {
    container.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (item.id === current ? ' is-on' : '');
      btn.textContent = item.label;
      btn.setAttribute('data-id', String(item.id));
      btn.addEventListener('click', function () { onPick(item); });
      container.appendChild(btn);
    });
  }

  function markChips(container, id) {
    var nodes = container.getElementsByClassName('chip');
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute('data-id') === String(id);
      nodes[i].className = on ? 'chip is-on' : 'chip';
    }
  }

  function updateJointLabel() {
    var sel = engine ? engine.state.selected : null;
    if (!sel) {
      jointLabel.textContent = '未选中关节 · 拖动空白处转视角';
      return;
    }
    var map = {
      hips: '胯', spine: '腰', chest: '胸', head: '头',
      armL: '左肩', armR: '右肩', forearmL: '左肘', forearmR: '右肘',
      handL: '左手', handR: '右手',
      thighL: '左胯', thighR: '右胯', shinL: '左膝', shinR: '右膝',
      footL: '左脚', footR: '右脚'
    };
    jointLabel.textContent = '当前：' + (map[sel] || sel) + ' · 拖动旋转';
  }

  function clearPreset() {
    markChips($('poseChips'), '');
  }

  function dismissHint() {
    if (hint.className.indexOf('is-hidden') === -1) {
      hint.className = 'stage-hint is-hidden';
    }
  }

  function updateCorners() {
    if (!engine || !engine.core) return;
    var r = engine.core.viewCss;
    var s = 13;
    setBox('fcTL', r.x + 6, r.y + 6);
    setBox('fcTR', r.x + r.w - s - 6, r.y + 6);
    setBox('fcBL', r.x + 6, r.y + r.h - s - 6);
    setBox('fcBR', r.x + r.w - s - 6, r.y + r.h - s - 6);
  }

  function setBox(id, left, top) {
    var el = $(id);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }

  /* 桌面端把舞台锁成 3:4 卡片，移动端铺满 */
  function layoutStage() {
    if (isDesktop()) {
      var w = stageWrap.clientWidth;
      var h = stageWrap.clientHeight;
      var sw = Math.min(w, h * 0.75);
      stage.style.width = Math.round(sw) + 'px';
      stage.style.height = Math.round(sw / 0.75) + 'px';
    } else {
      stage.style.width = '';
      stage.style.height = '';
    }
    relayout();
  }

  function relayout() {
    if (!engine) return;
    engine.resize();
    updateCorners();
  }

  /* ---------- 初始化 ---------- */
  setAppHeight();

  try {
    engine = window.PoseEngine.create(canvas);
  } catch (e) {
    engine = null;
  }

  if (!engine || !engine.core) {
    loading.className = 'stage-loading is-hidden';
    hint.style.display = 'none';
    ['fcTL', 'fcTR', 'fcBL', 'fcBR'].forEach(function (id) {
      $(id).style.display = 'none';
    });
    overlay.hidden = false;
    overlayTitle.textContent = '无法启用 3D 渲染';
    overlayText.textContent = '当前浏览器没有可用的 WebGL，换新版 Chrome、Edge 或 Safari 再试。';
    saveBtn.disabled = true;
  } else {
    engine.onContextLost = function () {
      overlay.hidden = false;
      overlayTitle.textContent = '3D 渲染已中断';
      overlayText.textContent = '正在尝试恢复，稍等几秒；也可以刷新页面重新打开。';
    };
    engine.onReady = function () {
      overlay.hidden = true;
    };
    layoutStage();
    loading.className = 'stage-loading is-hidden';
    setTimeout(layoutStage, 120);
  }

  /* ---------- 姿势 ---------- */
  buildChips($('poseChips'), PRESETS, 'stand', function (item) {
    engine.applyPose(item);
    markChips($('poseChips'), item.id);
    updateJointLabel();
    dismissHint();
    toast('已套用「' + item.label + '」');
  });

  $('resetPoseBtn').addEventListener('click', function () {
    engine.resetPose();
    markChips($('poseChips'), 'stand');
    updateJointLabel();
    toast('已回到站姿');
  });

  /* ---------- 机位 ---------- */
  buildChips($('frameChips'), FRAMES, 'full', function (item) {
    engine.setCamera({ frame: item.id });
    markChips($('frameChips'), item.id);
  });

  buildChips($('lensChips'), LENSES, 50, function (item) {
    engine.setCamera({ lens: item.id });
    markChips($('lensChips'), item.id);
  });

  $('pitchRange').addEventListener('input', function () {
    engine.setCamera({ pitch: +this.value });
    $('pitchVal').textContent = this.value + '°';
  });

  /* ---------- 灯光 ---------- */
  var grid = $('lightGrid');
  LIGHT_CELLS.forEach(function (cell) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'light-cell' + (cell.center ? ' is-center' : '');
    btn.textContent = cell.glyph;
    if (cell.center) {
      btn.setAttribute('data-center', '1');
    } else {
      btn.setAttribute('data-az', String(cell.az));
    }
    btn.addEventListener('click', function () {
      if (cell.center) {
        lightTop = true;
        engine.setLight({ el: 80 });
        $('lightEl').value = 80;
        $('lightElVal').textContent = '80°';
      } else {
        lightTop = false;
        lightAz = cell.az;
        engine.setLight({ az: cell.az });
      }
      syncLightCells();
      dismissHint();
    });
    grid.appendChild(btn);
  });

  function syncLightCells() {
    var nodes = grid.getElementsByClassName('light-cell');
    for (var i = 0; i < nodes.length; i++) {
      var isCenter = nodes[i].getAttribute('data-center') === '1';
      var on = isCenter ? lightTop : (!lightTop && +nodes[i].getAttribute('data-az') === lightAz);
      var cls = 'light-cell' + (isCenter ? ' is-center' : '');
      nodes[i].className = on ? cls + ' is-on' : cls;
    }
  }
  syncLightCells();

  $('lightEl').addEventListener('input', function () {
    engine.setLight({ el: +this.value });
    $('lightElVal').textContent = this.value + '°';
    lightTop = +this.value >= 76;
    syncLightCells();
  });

  $('lightIn').addEventListener('input', function () {
    engine.setLight({ intensity: +this.value / 100 });
    $('lightInVal').textContent = this.value + '%';
  });

  var rimToggle = $('rimToggle');
  rimToggle.addEventListener('click', function () {
    var on = !rimToggle.classList.contains('is-on');
    rimToggle.className = on ? 'switch is-on' : 'switch';
    rimToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    engine.setLight({ rim: on });
  });

  /* ---------- 场景 ---------- */
  buildChips($('bgChips'), BGS, 'warm', function (item) {
    engine.setScene({ bg: item.id });
    markChips($('bgChips'), item.id);
  });

  buildChips($('propChips'), PROPS, 'none', function (item) {
    engine.setScene({ prop: item.id });
    markChips($('propChips'), item.id);
  });

  /* ---------- 标签页（移动端） ---------- */
  var tabs = $('tabs').getElementsByClassName('tab');
  for (var ti = 0; ti < tabs.length; ti++) {
    tabs[ti].addEventListener('click', function () {
      var name = this.getAttribute('data-tab');
      for (var i = 0; i < tabs.length; i++) {
        var on = tabs[i].getAttribute('data-tab') === name;
        tabs[i].className = on ? 'tab is-active' : 'tab';
        var panel = document.querySelector('[data-panel="' + tabs[i].getAttribute('data-tab') + '"]');
        if (panel) panel.className = on ? 'panel is-active' : 'panel';
      }
      relayout();
    });
  }

  /* ---------- 指针交互 ---------- */
  var pointers = {};
  var mode = null;
  var dragBone = null;
  var lastX = 0;
  var lastY = 0;
  var pinchStart = 0;

  function pointerCount() {
    var n = 0;
    for (var k in pointers) if (pointers.hasOwnProperty(k)) n++;
    return n;
  }

  function pinchDistance() {
    var ids = [];
    for (var k in pointers) if (pointers.hasOwnProperty(k)) ids.push(k);
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (!engine || !engine.core) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pointerCount() === 1) {
      var rect = canvas.getBoundingClientRect();
      var hit = engine.pick(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        mode = 'pose';
        dragBone = hit;
        engine.setSelected(hit);
        updateJointLabel();
        clearPreset();
      } else {
        mode = 'orbit';
        engine.setSelected(null);
        updateJointLabel();
      }
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pointerCount() === 2) {
      mode = 'pinch';
      pinchStart = pinchDistance();
    }
    dismissHint();
  }, false);

  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId] || !engine || !engine.core) return;
    e.preventDefault();
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (mode === 'pinch' && pointerCount() === 2) {
      var d = pinchDistance();
      if (pinchStart > 10 && d > 10) {
        engine.zoomBy(d / pinchStart);
        pinchStart = d;
      }
      return;
    }
    if (mode === 'pose' && dragBone) {
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx || dy) engine.rotateBone(dragBone, dx, dy);
      return;
    }
    if (mode === 'orbit') {
      var ox = e.clientX - lastX;
      var oy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (ox || oy) engine.orbit(ox, oy);
    }
  }, false);

  function endPointer(e) {
    if (pointers[e.pointerId]) delete pointers[e.pointerId];
    if (pointerCount() < 2 && mode === 'pinch') mode = null;
    if (pointerCount() === 0) {
      mode = null;
      dragBone = null;
    }
  }
  canvas.addEventListener('pointerup', endPointer, false);
  canvas.addEventListener('pointercancel', endPointer, false);
  canvas.addEventListener('pointerleave', endPointer, false);

  canvas.addEventListener('wheel', function (e) {
    if (!engine || !engine.core) return;
    e.preventDefault();
    engine.zoomBy(1 + e.deltaY * 0.0012);
  }, { passive: false });

  /* ---------- 导出下载 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function exportFileName() {
    var d = new Date();
    return 'pose-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.png';
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = /:(.*?);/.exec(parts[0])[1];
    var bin = atob(parts[1]);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function downloadDataUrl(dataUrl) {
    try {
      var url = URL.createObjectURL(dataUrlToBlob(dataUrl));
      var a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function prefersTouchSave() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function showPreview(dataUrl) {
    previewImg.src = dataUrl;
    modalSub.textContent = prefersTouchSave()
      ? '手机上长按图片可保存到相册，也可以点“下载 PNG”。'
      : '若浏览器没有自动下载，可长按或右键保存这张图。';
    modal.hidden = false;
  }

  function buildExport() {
    return engine.exportDataUrl(EXPORT_W, EXPORT_H);
  }

  function handleExport() {
    if (!engine || !engine.core) {
      toast('3D 场景还没准备好');
      return;
    }
    saveBtn.disabled = true;
    toast('正在生成参考图');
    setTimeout(function () {
      var url = buildExport();
      saveBtn.disabled = false;
      if (!url) {
        toast('导出失败，请再试一次');
        return;
      }
      if (prefersTouchSave()) {
        showPreview(url);
        return;
      }
      if (downloadDataUrl(url)) toast('已下载 1080×1440 PNG');
      else showPreview(url);
    }, 40);
  }

  saveBtn.addEventListener('click', handleExport);

  $('modalSave').addEventListener('click', function () {
    if (!downloadDataUrl(previewImg.src)) {
      toast('下载失败，请长按图片保存');
    }
  });

  $('modalClose').addEventListener('click', function () {
    modal.hidden = true;
    previewImg.removeAttribute('src');
  });

  /* ---------- 启动 ---------- */
  updateJointLabel();
  setTimeout(dismissHint, 9000);

  window.addEventListener('resize', function () {
    setAppHeight();
    layoutStage();
  }, false);

  window.addEventListener('orientationchange', function () {
    setTimeout(function () {
      setAppHeight();
      layoutStage();
    }, 150);
  }, false);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight, false);
  }
})();
